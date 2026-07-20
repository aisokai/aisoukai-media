// Network transport for the intentional Telegram live check only.
// It is dynamically imported only after both explicit Human Gate flags and credentials pass.
export async function sendTelegram(botToken, chatId, text, fetchImpl = fetch) {
  const res = await fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
  const json = await res.json()
  if (!json.ok) throw new Error(`Telegram API エラー: ${json.description ?? JSON.stringify(json)}`)
  return json
}
