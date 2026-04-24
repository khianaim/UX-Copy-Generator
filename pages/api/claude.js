export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      systemPrompt,
      userMessage,
      prd,
      imageBase64,
      imageType,
    } = req.body;

    console.log("API KEY PRESENT:", !!process.env.ANTHROPIC_API_KEY);
    console.log("IMAGE RECEIVED:", !!imageBase64);

    if (!systemPrompt || !userMessage) {
      return res.status(400).json({ error: "Missing inputs" });
    }

    const cleanBase64 = imageBase64?.replace(
      /^data:image\/\w+;base64,/,
      ""
    );

    const fullMessage = prd
      ? `PRODUCT CONTEXT:\n${prd}\n\n---\n\n${userMessage}`
      : userMessage;

    const content = [
      {
        type: "text",
        text: fullMessage,
      },
    ];

    if (cleanBase64) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: imageType || "image/png",
          data: cleanBase64,
        },
      });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: "user", content }],
      }),
    });

    const rawText = await response.text();

    console.log("STATUS:", response.status);
    console.log("RAW RESPONSE:", rawText);

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Anthropic API failed",
        details: rawText,
      });
    }

    const data = JSON.parse(rawText);

    const text = data?.content?.find((c) => c.type === "text")?.text;

    if (!text) {
      return res.status(500).json({
        error: "No text returned from Claude",
      });
    }

    // extract JSON safely (handles ```json blocks too)
    const cleaned = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    let parsed;

    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      console.log("PARSE FAILED RAW TEXT:", text);

      return res.status(500).json({
        error: "Failed to parse Claude JSON",
        raw: text,
      });
    }

    return res.status(200).json({
      variations: parsed.variations || [],
      accessibility: parsed.accessibility || null,
      tip: parsed.tip || null,
      guidelinesApplied: parsed.guidelinesApplied || [],
      score: parsed.score || null,
      summary: parsed.summary || null,
      rewrite: parsed.rewrite || null,
      violations: parsed.violations || [],
    });

  } catch (err) {
    console.error("SERVER ERROR:", err);

    return res.status(500).json({
      error: err.message,
    });
  }
}