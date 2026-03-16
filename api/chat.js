export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured on server' });

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };

  try {
    let body = { ...req.body };
    let messages = [...(body.messages || [])];
    let finalResponse = null;

    // tool_use 루프: web_search 결과를 자동으로 처리해서 최종 텍스트 응답만 반환
    for (let i = 0; i < 8; i++) {
      const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...body, messages }),
      });

      const data = await upstream.json();

      if (!upstream.ok) {
        return res.status(upstream.status).json(data);
      }

      // 툴 사용 없으면 최종 응답
      if (data.stop_reason !== 'tool_use') {
        finalResponse = data;
        break;
      }

      // assistant 메시지 추가
      messages = [...messages, { role: 'assistant', content: data.content }];

      // tool_result 메시지 구성
      const toolResults = data.content
        .filter(b => b.type === 'tool_use')
        .map(b => ({
          type: 'tool_result',
          tool_use_id: b.id,
          content: 'Search completed.',
        }));

      if (toolResults.length === 0) { finalResponse = data; break; }
      messages = [...messages, { role: 'user', content: toolResults }];
    }

    if (!finalResponse) return res.status(500).json({ error: 'Tool loop did not complete' });
    return res.status(200).json(finalResponse);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
