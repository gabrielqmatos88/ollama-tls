import { useState, useEffect, useRef } from 'react'
import ChatMessage from './ChatMessage.jsx'
import ChatInput from './ChatInput.jsx'
import PromptBar from './PromptBar.jsx'
import { getPrompts } from '@/storage/prompts'
import { getDefaultProvider, getProviders } from '@/storage/providers'
import { replaceVariables } from '@/utils/templateParser'
import { callProvider } from '@/api/client.js'
import { onMessage, checkPending } from '@/utils/messageBus'
import NotesTab from './NotesTab.jsx'
import './App.css'

const CONVERSATIONS_KEY = 'conversations'

async function loadConversation() {
  const result = await chrome.storage.local.get(CONVERSATIONS_KEY)
  const conversations = result[CONVERSATIONS_KEY] || []
  return conversations[0] || { id: crypto.randomUUID(), messages: [], createdAt: Date.now(), updatedAt: Date.now() }
}

async function saveConversation(conversation) {
  const updated = { ...conversation, updatedAt: Date.now() }
  await chrome.storage.local.set({ [CONVERSATIONS_KEY]: [updated] })
}

export default function App() {
  const [conversation, setConversation] = useState(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const abortRef = useRef(null)
  const messagesEndRef = useRef(null)
  const conversationRef = useRef(conversation)
  const streamingContentRef = useRef('')
  const [activeProviderId, setActiveProviderId] = useState(null)
  const [activeTab, setActiveTab] = useState('chat')

  useEffect(() => {
    conversationRef.current = conversation
  }, [conversation])

  useEffect(() => {
    loadConversation().then(setConversation)

    // Subscribe to MessageBus
    const unsubscribe = onMessage((message) => {
      if (message.type === 'PROMPT_SELECTED') {
        handlePromptReceived(message.data.promptId, message.data.selectedText, message.data.variables)
      }
    })

    // Check for any pending messages
    checkPending()

    return unsubscribe
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversation?.messages, streamingContent])

  async function handlePromptReceived(promptId, selectedText, variables) {
    const prompts = (await getPrompts()) || []
    const prompt = prompts.find(p => p.id === promptId)
    if (!prompt) return

    const content = replaceVariables(prompt.template, selectedText, variables)
    const current = conversationRef.current

    const newMessage = { id: crypto.randomUUID(), role: 'user', content }
    const updated = {
      ...current,
      messages: [...(current?.messages || []), newMessage],
    }
    setConversation(updated)
    await saveConversation(updated)

    await sendToAI(updated.messages)
  }

  async function sendToAI(messages, providerId) {
    let provider = null
    if (providerId) {
      const providers = await getProviders()
      provider = providers.find(p => p.id === providerId)
    }
    if (!provider) {
      provider = await getDefaultProvider()
    }
    if (!provider) {
      const current = conversationRef.current
      const errorMsg = { id: crypto.randomUUID(), role: 'assistant', content: 'Error: No provider configured. Please add a provider in the options page.' }
      const updated = { ...current, messages: [...messages, errorMsg] }
      setConversation(updated)
      await saveConversation(updated)
      return
    }

    setIsStreaming(true)
    streamingContentRef.current = ''
    setStreamingContent('')
    abortRef.current = new AbortController()

    try {
      const aiMessages = messages.map(m => ({ role: m.role, content: m.content }))

      await callProvider({
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        model: provider.model,
        messages: aiMessages,
        signal: abortRef.current.signal,
        keepAlive: provider?.keepAlive,
        onChunk: (delta, full) => {
          streamingContentRef.current = full
          setStreamingContent(full)
        },
      })
    } catch (err) {
      if (err.name === 'AbortError') {
        // User stopped generation
      } else {
        const errorMsg = `Error: ${err.message}`
        streamingContentRef.current = errorMsg
        setStreamingContent(errorMsg)
      }
    } finally {
      setIsStreaming(false)
      const finalContent = streamingContentRef.current || ''
      if (finalContent) {
        const current = conversationRef.current
        const assistantMsg = { id: crypto.randomUUID(), role: 'assistant', content: finalContent }
        const updated = { ...current, messages: [...messages, assistantMsg] }
        setConversation(updated)
        await saveConversation(updated)
      }
      streamingContentRef.current = ''
      setStreamingContent('')
      abortRef.current = null
    }
  }

  async function handleSend(text) {
    const current = conversationRef.current
    const newMessage = { id: crypto.randomUUID(), role: 'user', content: text }
    const updated = {
      ...current,
      messages: [...(current?.messages || []), newMessage],
    }
    setConversation(updated)
    await saveConversation(updated)
    await sendToAI(updated.messages)
  }

  async function handlePromptSend(promptId, variables, providerId) {
    setActiveProviderId(providerId || null)
    const prompts = (await getPrompts()) || []
    const prompt = prompts.find(p => p.id === promptId)
    if (!prompt) return

    const content = replaceVariables(prompt.template, variables.text || '', variables)
    const current = conversationRef.current
    const newMessage = { id: crypto.randomUUID(), role: 'user', content }
    const updated = {
      ...current,
      messages: [...(current?.messages || []), newMessage],
    }
    setConversation(updated)
    await saveConversation(updated)
    await sendToAI(updated.messages, providerId)
  }

  function handleStop() {
    abortRef.current?.abort()
  }

  function handleCopy(text) {
    navigator.clipboard.writeText(text)
  }

  async function handleNewConversation() {
    const newConv = { id: crypto.randomUUID(), messages: [], createdAt: Date.now(), updatedAt: Date.now() }
    setConversation(newConv)
    await saveConversation(newConv)
  }

  const messages = conversation?.messages || []

  return (
    <>
      <div className="chat-header">
        <div className="tab-switcher">
          <button
            className={`tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            Chat
          </button>
          <button
            className={`tab-btn ${activeTab === 'notes' ? 'active' : ''}`}
            onClick={() => setActiveTab('notes')}
          >
            Notes
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {activeTab === 'chat' && isStreaming && <button className="stop-btn" onClick={handleStop}>Stop</button>}
          {activeTab === 'chat' && <button className="btn btn-secondary" onClick={handleNewConversation} style={{ padding: '4px 12px', fontSize: 13 }}>New</button>}
          <button className="btn btn-secondary" onClick={() => chrome.runtime.openOptionsPage()} style={{ padding: '4px 12px', fontSize: 13 }}>⚙️</button>
        </div>
      </div>
      {activeTab === 'chat' ? (
        <>
          <div className="chat-messages">
            {messages.length === 0 && !isStreaming && (
              <div className="empty-state">Select text on a page and choose a prompt to get started.</div>
            )}
            {messages.map((msg, i) => (
              <ChatMessage key={msg.id || i} message={msg} onCopy={handleCopy} />
            ))}
            {isStreaming && streamingContent && (
              <div className="chat-message assistant">
                <div className="message-content">
                  <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{streamingContent}</pre>
                </div>
                <span className="streaming-indicator" />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <PromptBar onSend={handlePromptSend} disabled={isStreaming} />
          <ChatInput onSend={handleSend} disabled={isStreaming} />
        </>
      ) : (
        <NotesTab />
      )}
    </>
  )
}
