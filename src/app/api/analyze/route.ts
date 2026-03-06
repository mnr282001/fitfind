export async function POST(req: Request) {
  const { image, mediaType } = await req.json();

  // Gemini 2.5 Flash — ~$0.001 per image
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType: mediaType, data: image } },
            {
              text: `You are an expert fashion stylist. For each visible clothing item, accessory, and footwear, return a JSON array with objects containing:
- "category": garment type
- "description": specific details (color, fabric, silhouette, fit, logos)
- "brand_guess": brand if visible, otherwise "Unknown"
- "search_query": shopping search query to find this item
- "price_estimate": USD price range

Respond ONLY with valid JSON array. No markdown.`
            }
          ]
        }]
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    return Response.json({ error: "Gemini API error", detail: err }, { status: 502 });
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";

  // Clean any markdown fences Gemini might add
  const cleaned = text.replace(/```json\n?|```/g, "").trim();

  try {
    return Response.json({ items: JSON.parse(cleaned) });
  } catch {
    return Response.json({ error: "Failed to parse model response", raw: cleaned }, { status: 500 });
  }
}