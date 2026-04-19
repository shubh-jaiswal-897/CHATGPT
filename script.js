document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const chatMessages = document.getElementById('chat-messages');
    const welcomeScreen = document.getElementById('welcome-screen');
    const modelSelect = document.getElementById('model-select');
    
    // Settings Modal
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettings = document.getElementById('close-settings');
    const saveSettings = document.getElementById('save-settings');
    const geminiKeyInput = document.getElementById('gemini-key');
    
    // UI Controls
    const newChatBtn = document.getElementById('new-chat-btn');
    const clearChatBtn = document.getElementById('clear-chat-btn');
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const sidebar = document.querySelector('.sidebar');
    const chatHistoryList = document.getElementById('chat-history-list');

    // State
    // A single conversation string or structure formatted for the API
    let conversationHistory = [];
    let isGenerating = false;

    // Load API Keys from localStorage
    geminiKeyInput.value = localStorage.getItem('nexus_gemini_api_key') || '';

    // If key exists, pre-select Gemini
    if(localStorage.getItem('nexus_gemini_api_key')) {
        modelSelect.value = 'gemini';
    }

    // Configure Marked to highlight code and use Github Flavored Markdown
    marked.setOptions({
        gfm: true,
        breaks: true,
        highlight: function(code, lang) {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language }).value;
        },
        langPrefix: 'hljs language-'
    });

    // Auto-resize textarea
    chatInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        if(this.scrollHeight > 200) {
            this.style.overflowY = 'auto';
        } else {
            this.style.overflowY = 'hidden';
        }
        
        if (this.value.trim() !== '') {
            sendBtn.classList.add('active');
            sendBtn.disabled = false;
        } else {
            sendBtn.classList.remove('active');
            sendBtn.disabled = true;
        }
    });

    // Handle Enter key (Shift+Enter for new line)
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if(!sendBtn.disabled) {
                handleSend();
            }
        }
    });

    sendBtn.addEventListener('click', handleSend);

    // Settings Modal Listeners
    settingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
    closeSettings.addEventListener('click', () => settingsModal.classList.add('hidden'));
    
    saveSettings.addEventListener('click', () => {
        const key = geminiKeyInput.value.trim();
        localStorage.setItem('nexus_gemini_api_key', key);
        if(key) {
            modelSelect.value = 'gemini';
        }
        settingsModal.classList.add('hidden');
    });

    // Modal Close on outside click
    settingsModal.addEventListener('click', (e) => {
        if(e.target === settingsModal) {
            settingsModal.classList.add('hidden');
        }
    });

    // Mobile Sidebar
    mobileMenuBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
    });
    
    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 850 && 
            sidebar.classList.contains('open') && 
            !sidebar.contains(e.target) && 
            !mobileMenuBtn.contains(e.target)) {
            sidebar.classList.remove('open');
        }
    });

    newChatBtn.addEventListener('click', resetChat);
    clearChatBtn.addEventListener('click', resetChat);

    // Helper exposed to window for the "Suggestion Cards" inside index.html
    window.setInput = (text) => {
        if(isGenerating) return;
        chatInput.value = text;
        chatInput.dispatchEvent(new Event('input')); // trigger resize and button active state
        chatInput.focus();
        // Automatically send after a brief delay for a better user experience
        setTimeout(() => {
            if(!sendBtn.disabled) handleSend();
        }, 300);
    };

    function resetChat() {
        if(isGenerating) return;
        conversationHistory = [];
        chatMessages.innerHTML = '';
        chatMessages.appendChild(welcomeScreen);
        welcomeScreen.style.display = 'flex';
        
        chatInput.value = '';
        chatInput.style.height = 'auto';
        sendBtn.classList.remove('active');
        sendBtn.disabled = true;
        
        // Update Sidebar
        chatHistoryList.innerHTML = '<li class="active"><i class="ri-chat-3-line"></i> New Dialogue</li>';
        
        if(window.innerWidth <= 850) sidebar.classList.remove('open');
    }

    async function handleSend() {
        const text = chatInput.value.trim();
        if (!text || isGenerating) return;

        // Hide welcome screen on first message
        if (welcomeScreen.style.display !== 'none') {
            welcomeScreen.style.display = 'none';
            // Update sidebar title dynamically
            updateSidebarTitle(text);
        }

        // 1. Add user message to UI
        addMessageToUI('user', text);
        
        // Block UI
        chatInput.value = '';
        chatInput.style.height = 'auto';
        sendBtn.classList.remove('active');
        sendBtn.disabled = true;
        chatInput.placeholder = "Nexus AI is thinking...";
        chatInput.disabled = true;
        
        // 2. Show typing indicator
        const typingId = 'typing-' + Date.now();
        addTypingIndicator(typingId);
        
        isGenerating = true;

        try {
            // 3. fetch response
            const response = await generateAIResponse(text);
            
            // 4. Update UI
            removeElement(typingId);
            addMessageToUI('bot', response);
        } catch (error) {
            removeElement(typingId);
            addMessageToUI('bot', `**System Alert Configuration Error:**\n\n${error.message}\n\nPlease click **Integrations & Keys** in the sidebar to verify your setup.`);
        } finally {
            // Unblock UI
            isGenerating = false;
            chatInput.disabled = false;
            chatInput.placeholder = "Message Nexus AI...";
            chatInput.focus();
        }
    }

    function addMessageToUI(sender, text) {
        let cleanHTML;
        if (sender === 'bot') {
            const rawHTML = marked.parse(text);
            // Sanitize to prevent XSS but allow code blocks, tables, etc.
            cleanHTML = DOMPurify.sanitize(rawHTML);
        } else {
            // Simple sanitization for user input to prevent XSS
            cleanHTML = `<p>${DOMPurify.sanitize(text).replace(/\n/g, '<br>')}</p>`;
        }

        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${sender}`;
        
        const avatarUser = `<div class="message-avatar"><i class="ri-user-5-fill"></i></div>`;
        const avatarBot = `<div class="message-avatar"><i class="ri-triangle-fill"></i></div>`;
        const avatar = sender === 'user' ? avatarUser : avatarBot;

        msgDiv.innerHTML = `
            ${avatar}
            <div class="message-content">
                ${cleanHTML}
            </div>
        `;
        
        chatMessages.appendChild(msgDiv);
        scrollToBottom();
    }

    function addTypingIndicator(id) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message bot`;
        msgDiv.id = id;
        
        msgDiv.innerHTML = `
            <div class="message-avatar"><i class="ri-triangle-fill"></i></div>
            <div class="message-content">
                <div class="typing-indicator">
                    <div class="dot"></div>
                    <div class="dot"></div>
                    <div class="dot"></div>
                </div>
            </div>
        `;
        
        chatMessages.appendChild(msgDiv);
        scrollToBottom();
    }

    function removeElement(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function updateSidebarTitle(firstMessage) {
        let title = firstMessage.split(' ').slice(0, 4).join(' ');
        if(title.length < firstMessage.length) title += '...';
        
        chatHistoryList.innerHTML = `<li class="active"><i class="ri-chat-3-line"></i> ${DOMPurify.sanitize(title)}</li>`;
    }

    // AI API Integration logic
    async function generateAIResponse(prompt) {
        const model = modelSelect.value;
        const geminiKey = localStorage.getItem('nexus_gemini_api_key');
        
        // Push user message to context payload format
        conversationHistory.push({
            role: "user",
            parts: [{ text: prompt }]
        });

        if (model === 'gemini') {
            if (!geminiKey) {
                // If they selected Gemini but no key is provided, error out nicely
                throw new Error("Missing Google Gemini API Key. Please provide one in Settings to use the live AI model.");
            }
            
            // Note: We use gemini-1.5-flash-latest which is faster and supports this API structure
            const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiKey}`;
            
            const response = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: conversationHistory,
                    generationConfig: {
                        temperature: 0.7,
                    }
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                const errMsg = errData.error && errData.error.message ? errData.error.message : response.statusText;
                
                // If key is invalid (400 default google response for bad key)
                if (errMsg.includes("API key not valid")) {
                   throw new Error("The API key provided is invalid. Please check your spelling.");
                }
                
                throw new Error(errMsg || "Failed to communicate with Google API server.");
            }

            const data = await response.json();
            
            if(!data.candidates || data.candidates.length === 0) {
                throw new Error("No response generated by the model. It might have been blocked due to safety settings.");
            }
            
            const botReply = data.candidates[0].content.parts[0].text;
            
            // Push bot reply to history so next requests have context
            conversationHistory.push({
                role: "model",
                parts: [{ text: botReply }]
            });
            
            return botReply;
        } 
        else {
            // Handle Mock agent
            return await generateMockResponse(prompt);
        }
    }

    // A mock offline responder 
    async function generateMockResponse(prompt) {
        return new Promise(resolve => {
            setTimeout(() => {
                const botReply = `> Note: You are currently disconnected from the live matrix. Using local mock generator. \n\nI received your query:\n\n\`\`\`text\n${prompt}\n\`\`\`\n\n### System Diagnostics\n\nI am fully responsive. The UI supports:\n- **Rich Text Markdown**\n- Code Highlights\n- Continuous Conversations\n- Dynamic layouts\n\nTo unlock true generation, select **Google Gemini 1.5** and attach your API key in the Integrations panel.`;
                
                // Push to mock history
                conversationHistory.push({
                    role: "model",
                    parts: [{ text: botReply }]
                });

                resolve(botReply);
            }, 1800); // simulate network latency
        });
    }
});
