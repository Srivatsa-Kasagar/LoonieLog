/**
 * @fileoverview AIRouter.gs — AI model selector and CRA extraction router.
 * Routes receipt payloads to Gemini 1.5 Flash or Claude 3.5 Sonnet,
 * injects the CRA master prompt, and returns parsed JSON.
 *
 * Depends on: Config.gs (GEMINI_ENDPOINT, CLAUDE_ENDPOINT, CRA_PROMPT_TEMPLATE)
 *             Code.gs (logAudit)
 */

var AIRouter = (function() {

  /** Required fields that must be present in a valid AI response. */
  var REQUIRED_FIELDS = [
    "date", "vendor", "subtotal", "gst_hst", "pst_qst", "total",
    "currency", "cra_category_code", "cra_category_name",
    "is_meal", "is_capital", "is_gift", "is_receipt",
    "expense_type", "confidence"
  ];

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC — extractReceiptData
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Main routing function. Reads AI_MODEL from PropertiesService and calls the
   * appropriate model. Retries with an explicit JSON instruction on parse failure.
   *
   * @param {{
   *   type: "email"|"image"|"pdf",
   *   content: string|Blob,
   *   metadata: {subject?: string, fileName?: string, source?: string}
   * }} payload - Receipt content and metadata
   * @returns {Object} Parsed CRA JSON object
   * @throws {Error} On API failure or unparseable response after retry
   */
  function extractReceiptData(payload) {
    var props   = PropertiesService.getUserProperties();
    var rawText;

    // ── Tier-aware routing ──────────────────────────────────────────────────
    // Micro + Managed Pro → developer's central Gemini endpoint (no user key needed)
    // Core DIY            → user's own API key (Gemini or Claude)
    var aiMode = TierManager.getTierAIMode();
    logAudit("AIRouter.extractReceiptData",
      "Routing via: " + aiMode + " (tier: " + TierManager.getUserTier() + ")", "OK");

    try {
      if (aiMode === "developer") {
        rawText = callDeveloperEndpoint_(payload);
      } else {
        var model = props.getProperty("AI_MODEL") || "gemini";
        rawText = (model === "claude") ? callClaude_(payload, getActivePrompt_()) : callGemini_(payload, getActivePrompt_());
      }
    } catch (e) {
      logAudit("AIRouter.extractReceiptData", "API call failed: " + e.message, "ERROR");
      throw e;
    }

    // First parse attempt
    var parsed = tryParseJson_(rawText);
    if (parsed && hasRequiredFields_(parsed)) {
      return parsed;
    }

    // Retry with explicit JSON-only instruction
    logAudit("AIRouter.extractReceiptData", "JSON parse failed — retrying with JSON-only instruction", "WARN");
    var retryPayload = {
      type:     "email",
      content:  "Return ONLY valid JSON with no markdown. Previous attempt returned non-JSON. Original content:\n\n" +
                (typeof payload.content === "string" ? payload.content : "[binary file]"),
      metadata: payload.metadata
    };

    try {
      var retryText   = (aiMode === "developer")
        ? callDeveloperEndpoint_(retryPayload)
        : ((props.getProperty("AI_MODEL") === "claude") ? callClaude_(retryPayload, getActivePrompt_()) : callGemini_(retryPayload, getActivePrompt_()));
      var retryParsed = tryParseJson_(retryText);
      if (retryParsed && hasRequiredFields_(retryParsed)) {
        return retryParsed;
      }
    } catch (e2) {
      logAudit("AIRouter.extractReceiptData", "Retry also failed: " + e2.message, "ERROR");
    }

    throw new Error("Could not extract valid JSON from AI response. Raw: " + String(rawText).slice(0, 300));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC — testConnection
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Validates an API key by sending a minimal test prompt.
   * Called from Installer.gs during setup.
   *
   * @param {string} apiKey  - The API key to test
   * @param {string} aiModel - "gemini" or "claude"
   * @returns {{ success: boolean, message: string }}
   */
  function testConnection(apiKey, aiModel) {
    try {
      var testPayload = {
        type:     "email",
        content:  'Return this exact JSON: {"status":"ok"}',
        metadata: { subject: "API key test", source: "Installer" }
      };

      // Temporarily override the stored key for the test call
      var props = PropertiesService.getUserProperties();
      var prevKey   = props.getProperty("API_KEY");
      var prevModel = props.getProperty("AI_MODEL");
      props.setProperty("API_KEY",   apiKey);
      props.setProperty("AI_MODEL",  aiModel);

      var rawText;
      try {
        rawText = (aiModel === "claude") ? callClaude_(testPayload, null) : callGemini_(testPayload, null);
      } finally {
        // Restore previous values (may be null during first install — that's fine)
        if (prevKey)   props.setProperty("API_KEY",  prevKey);
        if (prevModel) props.setProperty("AI_MODEL", prevModel);
      }

      var parsed = tryParseJson_(rawText);
      if (parsed && parsed.status === "ok") {
        return { success: true, message: "API key validated." };
      }
      return { success: false, message: "API key test returned unexpected response: " + String(rawText).slice(0, 100) };

    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — callDeveloperEndpoint_
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Calls the developer's central Gemini 1.5 Flash proxy endpoint.
   * Used by Micro (Free) and Managed Pro tiers — no user API key required.
   * The endpoint is an Apps Script Web App that holds the developer's Gemini key.
   *
   * Payload sent as JSON POST: { type, content (base64 for blobs), metadata, prompt }
   * Response expected: { text: "<raw AI response string>" }
   *
   * @param {Object} payload - Standard receipt payload
   * @returns {string} Raw AI response text
   * @private
   */
  function callDeveloperEndpoint_(payload) {
    var prompt = buildPrompt_(payload);

    // Convert Blob content to base64 string for JSON transport
    var contentForTransport;
    if (payload.content && typeof payload.content !== "string") {
      contentForTransport = Utilities.base64Encode(payload.content.getBytes());
    } else {
      contentForTransport = payload.content || "";
    }

    var body = JSON.stringify({
      type:     payload.type,
      content:  contentForTransport,
      metadata: payload.metadata || {},
      prompt:   prompt
    });

    var options = {
      method:             "post",
      contentType:        "application/json",
      payload:            body,
      muteHttpExceptions: true
    };

    var response = fetchWithBackoff_(DEVELOPER_AI_ENDPOINT, options, "DeveloperEndpoint");
    var code     = response.getResponseCode();

    if (code !== 200) {
      throw new Error("Developer endpoint returned HTTP " + code + ": " + response.getContentText().slice(0, 200));
    }

    var json = JSON.parse(response.getContentText());
    if (!json.text) throw new Error("Developer endpoint response missing 'text' field.");
    return json.text;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — callGemini_
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Calls Gemini 2.5 Flash via the generateContent endpoint.
   * Supports text and vision (base64 inlineData for images/PDFs).
   * Implements exponential backoff on 429 and 5xx responses.
   *
   * @param {Object} payload - Same shape as extractReceiptData payload
   * @param {string} [systemInstruction] - Optional system instruction override
   * @returns {string} Raw response text from the model
   * @private
   */
  function callGemini_(payload, systemInstruction) {
    var props  = PropertiesService.getUserProperties();
    var apiKey = props.getProperty("API_KEY");
    if (!apiKey) throw new Error("API_KEY not set in PropertiesService.");

    var prompt = buildPrompt_(payload);
    var parts  = [{ text: prompt }];

    // Add vision part for image/PDF payloads
    if ((payload.type === "image" || payload.type === "pdf") && payload.content) {
      var b64      = blobToBase64_(payload.content);
      var mimeType = payload.type === "pdf" ? "application/pdf" : (payload.content.getContentType() || "image/jpeg");
      parts.push({ inlineData: { mimeType: mimeType, data: b64 } });
    }

    var requestBody = {
      contents: [{ parts: parts }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
    };

    // Only add system instruction if provided
    if (systemInstruction) {
      requestBody.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    var url     = GEMINI_ENDPOINT + "?key=" + apiKey;
    var options = {
      method:             "post",
      contentType:        "application/json",
      payload:            JSON.stringify(requestBody),
      muteHttpExceptions: true
    };

    return fetchWithBackoff_(url, options, "Gemini");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — callClaude_
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Calls Claude 3.5 Sonnet via the Anthropic Messages API.
   * Supports text and vision (base64 image blocks).
   * Implements exponential backoff on 429 and 5xx responses.
   *
   * @param {Object} payload - Same shape as extractReceiptData payload
   * @param {string} [systemInstruction] - Optional system instruction override
   * @returns {string} Raw response text from the model
   * @private
   */
  function callClaude_(payload, systemInstruction) {
    var props  = PropertiesService.getUserProperties();
    var apiKey = props.getProperty("API_KEY");
    if (!apiKey) throw new Error("API_KEY not set in PropertiesService.");

    var prompt = buildPrompt_(payload);

    var contentBlocks = [];

    // Add vision block for image payloads
    if (payload.type === "image" && payload.content) {
      var b64      = blobToBase64_(payload.content);
      var mimeType = payload.content.getContentType() || "image/jpeg";
      contentBlocks.push({
        type:   "image",
        source: { type: "base64", media_type: mimeType, data: b64 }
      });
    }

    contentBlocks.push({ type: "text", text: prompt });

    var requestBody = {
      model:      "claude-sonnet-4-6",
      max_tokens: 2048,
      messages:   [{ role: "user", content: contentBlocks }]
    };

    // Only add system instruction if provided
    if (systemInstruction) {
      requestBody.system = systemInstruction;
    }

    var options = {
      method:             "post",
      contentType:        "application/json",
      headers: {
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01"
      },
      payload:            JSON.stringify(requestBody),
      muteHttpExceptions: true
    };

    return fetchWithBackoff_(CLAUDE_ENDPOINT, options, "Claude");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — fetchWithBackoff_
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Executes a UrlFetchApp call with exponential backoff.
   * Retries up to 3 times on 429 (rate limit) or 5xx (server error) responses.
   * Extracts the text content from either Gemini or Claude response format.
   *
   * @param {string} url       - Request URL
   * @param {Object} options   - UrlFetchApp options object
   * @param {string} modelName - "Gemini" or "Claude" (for log messages)
   * @returns {string} Extracted text content from the model response
   * @private
   */
  function fetchWithBackoff_(url, options, modelName) {
    var maxAttempts = 5;
    var delayMs     = 2000;

    for (var attempt = 1; attempt <= maxAttempts; attempt++) {
      var response = UrlFetchApp.fetch(url, options);
      var code     = response.getResponseCode();
      var body     = response.getContentText();

      if (code === 200) {
        var json = JSON.parse(body);
        // Extract text from Gemini response
        if (json.candidates && json.candidates[0]) {
          return json.candidates[0].content.parts[0].text;
        }
        // Extract text from Claude response
        if (json.content && json.content[0]) {
          return json.content[0].text;
        }
        throw new Error(modelName + " response missing text content: " + body.slice(0, 200));
      }

      if (code === 429 || code >= 500) {
        if (attempt < maxAttempts) {
          var headers     = response.getHeaders() || {};
          var retryAfter  = parseInt(headers['Retry-After'] || headers['retry-after'] || 0, 10) || 0;
          var baseDelayMs = (code === 429) ? 60000 : delayMs;

          if (retryAfter > 0) {
            baseDelayMs = Math.max(baseDelayMs, retryAfter * 1000);
          }

          var jitter = 1 + (Math.random() * 0.3); // 0%–30%
          var sleepMs = Math.round(baseDelayMs * jitter);

          logAudit("AIRouter.fetchWithBackoff_", modelName + " HTTP " + code + " — retrying in " + (sleepMs / 1000) + "s (attempt " + attempt + ")", "WARN");
          Utilities.sleep(sleepMs);

          // Increase delay for next attempt; capped at 5 minutes for 429.
          if (code === 429) {
            delayMs = Math.min(baseDelayMs * 2, 5 * 60 * 1000);
          } else {
            delayMs = delayMs * 2;
          }

          continue;
        }

        // Final attempt failed. Provide explicit guidance.
        if (code === 429) {
          throw new Error(modelName + " API error HTTP 429: quota exceeded. " +
            "Check plan/billing and pause uploads until quota resets. " +
            body.slice(0, 300));
        }
      }

      // Non-retryable error or 4xx/other final condition
      throw new Error(modelName + " API error HTTP " + code + ": " + body.slice(0, 300));
    }

    throw new Error(modelName + " API failed after " + maxAttempts + " attempts.");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — buildPrompt_
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Constructs the extraction prompt by prepending source metadata context
   * to the receipt content. This gives the AI useful context without
   * modifying the canonical CRA_PROMPT_TEMPLATE.
   *
   * @param {Object} payload - Receipt payload with content and metadata
   * @returns {string} Full prompt string
   * @private
   */
  function buildPrompt_(payload) {
    var meta    = payload.metadata || {};
    var subject = meta.subject   ? "Email subject: " + meta.subject + "\n"   : "";
    var file    = meta.fileName  ? "File name: "     + meta.fileName + "\n"  : "";
    var source  = meta.source    ? "Source: "        + meta.source + "\n"    : "";
    var context = (subject + file + source).trim();

    if (typeof payload.content === "string") {
      return (context ? context + "\n\n---\n\n" : "") + payload.content;
    }

    // For binary payloads (image/pdf), the blob is added as a vision part separately
    return context ? context + "\n\nAnalyze the attached receipt image/document." : "Analyze the attached receipt.";
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — getActivePrompt_
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Returns the active CRA extraction prompt.
   * Uses the PropertiesService override (set by checkForPromptUpdates) if present,
   * otherwise falls back to the compiled-in CRA_PROMPT_TEMPLATE constant.
   *
   * @returns {string} Active prompt string
   * @private
   */
  function getActivePrompt_() {
    var override = PropertiesService.getUserProperties().getProperty("CRA_PROMPT_OVERRIDE");
    return (override && override.length > 50) ? override : CRA_PROMPT_TEMPLATE;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — blobToBase64_
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Converts a Google Apps Script Blob to a base64 encoded string.
   *
   * @param {GoogleAppsScript.Base.Blob} blob - The file blob to encode
   * @returns {string} Base64 encoded string
   * @private
   */
  function blobToBase64_(blob) {
    return Utilities.base64Encode(blob.getBytes());
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — tryParseJson_
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Attempts to parse a JSON string.
   * Strips markdown code fences (```json ... ```) if present.
   *
   * @param {string} text - Raw text from AI model
   * @returns {Object|null} Parsed object, or null on failure
   * @private
   */
  function tryParseJson_(text) {
    try {
      // Strip markdown code fences if model disobeys JSON-only instruction
      var cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
      return JSON.parse(cleaned);
    } catch (e) {
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE — hasRequiredFields_
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Validates that all required CRA fields are present in the parsed object.
   *
   * @param {Object} obj - Parsed AI response
   * @returns {boolean}
   * @private
   */
  function hasRequiredFields_(obj) {
    for (var i = 0; i < REQUIRED_FIELDS.length; i++) {
      if (!(REQUIRED_FIELDS[i] in obj)) return false;
    }
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────
  return {
    extractReceiptData: extractReceiptData,
    testConnection:     testConnection
  };

})();
