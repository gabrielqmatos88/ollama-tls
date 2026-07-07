export default function ChatMessage({ message, onCopy }) {
  const isUser = message.role === 'user'

  return (
    <div className={`chat-message ${isUser ? 'user' : 'assistant'}`}>
      <div className="message-content">
        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{message.content}</pre>
      </div>
      {!isUser && (
        <button className="copy-btn" onClick={() => onCopy(message.content)} title="Copy">
          Copy
        </button>
      )}
    </div>
  )
}
