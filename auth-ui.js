// auth-ui.js
import {
    auth,
    db,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updateProfile,
    collection,
    addDoc,
    query,
    orderBy,
    onSnapshot,
    serverTimestamp,
    where,
    getDocs
} from './firebase-config.js';

class AuthUI {
    constructor() {
        this.currentUser = null;
        this.currentChannel = 'ideas';
        this.messageListener = null;
        this.allMessages = [];
        this.onlineUsers = new Set();
        this.currentLang = 'en';
        
        this.init();
    }

    init() {
        this.cacheDOM();
        this.bindEvents();
        this.initAuthListener();
        this.initLanguageSwitcher();
    }

    cacheDOM() {
        // Modal elements
        this.authModal = document.getElementById('auth-modal');
        this.authToggleBtn = document.getElementById('auth-toggle-btn');
        this.loginForm = document.getElementById('login-form');
        this.registerForm = document.getElementById('register-form');
        this.logoutBtn = document.getElementById('logout-btn');
        
        // Chat elements
        this.messageInput = document.getElementById('message-input');
        this.sendButton = document.getElementById('send-button');
        this.messagesContainer = document.getElementById('messages-container');
        this.displayNameElement = document.getElementById('display-name');
        this.userRoleElement = document.getElementById('user-role');
        this.statusDot = document.getElementById('status-dot');
        this.userStatusElement = document.getElementById('user-status');
        this.channelItems = document.querySelectorAll('.channel-item');
        this.peopleList = document.getElementById('people-list');
        
        // Search elements
        this.searchBtn = document.getElementById('search-btn');
        this.searchModal = document.getElementById('search-modal');
        this.searchModalClose = document.getElementById('search-modal-close');
        this.searchModalInput = document.getElementById('search-modal-input');
        this.searchResults = document.getElementById('search-results');
    }

    bindEvents() {
        // Login form
        this.loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        
        // Register form
        this.registerForm.addEventListener('submit', (e) => this.handleRegister(e));
        
        // Logout
        this.logoutBtn.addEventListener('click', () => this.handleLogout());
        
        // Send message
        this.sendButton.addEventListener('click', () => this.sendMessage());
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        
        // Channel switching
        this.channelItems.forEach(item => {
            item.addEventListener('click', () => this.switchChannel(item));
        });
        
        // Search functionality
        this.searchBtn.addEventListener('click', () => this.openSearch());
        this.searchModalClose.addEventListener('click', () => this.closeSearch());
        this.searchModalInput.addEventListener('input', () => this.handleSearch());
        
        // Close modals when clicking outside
        window.addEventListener('click', (e) => {
            if (e.target === this.authModal) this.closeAuthModal();
            if (e.target === this.searchModal) this.closeSearch();
        });
    }

    async handleLogin(e) {
        e.preventDefault();
        
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const errorElement = document.getElementById('login-error');
        const successElement = document.getElementById('login-success');
        const loadingElement = document.getElementById('login-loading');
        
        if (!email || !password) {
            this.showMessage(errorElement, 'Please fill in all fields');
            return;
        }
        
        this.showLoading(loadingElement, true);
        
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            console.log('Login successful:', userCredential.user);
            this.showMessage(successElement, 'Login successful!');
            this.closeAuthModal();
        } catch (error) {
            console.error('Login error:', error);
            this.showMessage(errorElement, this.getErrorMessage(error.code));
        } finally {
            this.showLoading(loadingElement, false);
        }
    }

    async handleRegister(e) {
        e.preventDefault();
        
        const name = document.getElementById('register-name').value;
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        const confirmPassword = document.getElementById('register-confirm-password').value;
        const errorElement = document.getElementById('register-error');
        const successElement = document.getElementById('register-success');
        const loadingElement = document.getElementById('register-loading');
        
        // Validation
        if (!name || !email || !password || !confirmPassword) {
            this.showMessage(errorElement, 'Please fill in all fields');
            return;
        }
        
        if (password.length < 6) {
            this.showMessage(errorElement, 'Password must be at least 6 characters');
            return;
        }
        
        if (password !== confirmPassword) {
            this.showMessage(errorElement, 'Passwords do not match');
            return;
        }
        
        this.showLoading(loadingElement, true);
        
        try {
            // Create user
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            
            // Update profile
            await updateProfile(userCredential.user, {
                displayName: name
            });
            
            // Create user document in Firestore
            await this.createUserDocument(userCredential.user);
            
            console.log('Registration successful:', userCredential.user);
            this.showMessage(successElement, 'Account created successfully!');
            this.closeAuthModal();
        } catch (error) {
            console.error('Registration error:', error);
            this.showMessage(errorElement, this.getErrorMessage(error.code));
        } finally {
            this.showLoading(loadingElement, false);
        }
    }

    async createUserDocument(user) {
        try {
            await addDoc(collection(db, 'users'), {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName || user.email.split('@')[0],
                createdAt: serverTimestamp(),
                lastSeen: serverTimestamp(),
                status: 'online',
                avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || user.email)}&background=ec4899&color=fff`
            });
        } catch (error) {
            console.log('User document creation error:', error);
        }
    }

    async handleLogout() {
        try {
            await signOut(auth);
        } catch (error) {
            console.error('Logout error:', error);
        }
    }

    initAuthListener() {
        onAuthStateChanged(auth, (user) => {
            console.log('Auth state changed:', user);
            
            if (user) {
                this.currentUser = user;
                this.showChatInterface(user);
                this.loadMessages();
                this.loadOnlineUsers();
                this.updateUserStatus('online');
            } else {
                this.currentUser = null;
                this.showAuthInterface();
                this.clearMessageListener();
            }
        });
    }

    showChatInterface(user) {
        // Hide auth modal
        this.closeAuthModal();
        
        // Update UI elements
        this.displayNameElement.textContent = user.displayName || user.email.split('@')[0];
        this.userRoleElement.textContent = 'Active Member';
        this.statusDot.style.background = '#28971e';
        this.userStatusElement.textContent = 'Online';
        
        // Update auth button
        this.authToggleBtn.textContent = 'Profile';
        this.authToggleBtn.classList.remove('login-btn');
        this.authToggleBtn.classList.add('donate-btn');
        
        // Show logout button
        this.logoutBtn.style.display = 'block';
        
        // Enable message input
        this.messageInput.disabled = false;
        this.messageInput.placeholder = 'Type your message here...';
        this.sendButton.disabled = false;
        
        // Clear welcome message
        this.messagesContainer.innerHTML = '';
    }

    showAuthInterface() {
        // Reset UI elements
        this.displayNameElement.textContent = 'Guest User';
        this.userRoleElement.textContent = 'Join to chat';
        this.statusDot.style.background = '#000000de';
        this.userStatusElement.textContent = 'Offline';
        
        // Update auth button
        this.authToggleBtn.textContent = 'Login';
        this.authToggleBtn.classList.remove('donate-btn');
        this.authToggleBtn.classList.add('login-btn');
        
        // Hide logout button
        this.logoutBtn.style.display = 'none';
        
        // Disable message input
        this.messageInput.disabled = true;
        this.messageInput.placeholder = 'Sign in to send messages...';
        this.sendButton.disabled = true;
        
        // Show welcome message
        this.messagesContainer.innerHTML = '<div class="no-results">Sign in to join the conversation!</div>';
    }

    async updateUserStatus(status) {
        if (!this.currentUser) return;
        
        try {
            const usersRef = collection(db, 'users');
            const q = query(usersRef, where('uid', '==', this.currentUser.uid));
            const querySnapshot = await getDocs(q);
            
            if (!querySnapshot.empty) {
                // In a real app, you would update the document
                // For now, we'll just log it
                console.log('User status updated to:', status);
            }
        } catch (error) {
            console.error('Error updating user status:', error);
        }
    }

    loadMessages() {
        if (!this.currentUser) return;
        
        // Clear previous listener
        this.clearMessageListener();
        
        const messagesRef = collection(db, 'messages');
        const q = query(
            messagesRef,
            where('channel', '==', this.currentChannel),
            orderBy('timestamp', 'asc')
        );
        
        this.messageListener = onSnapshot(q, (querySnapshot) => {
            this.messagesContainer.innerHTML = '';
            this.allMessages = [];
            
            if (querySnapshot.empty) {
                this.messagesContainer.innerHTML = '<div class="no-results">No messages yet. Start the conversation!</div>';
                return;
            }
            
            querySnapshot.forEach((doc) => {
                const message = doc.data();
                this.displayMessage(message);
                this.allMessages.push(message);
            });
            
            // Scroll to bottom
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        });
    }

    displayMessage(message) {
        const messageDiv = document.createElement('div');
        const isCurrentUser = this.currentUser && message.userId === this.currentUser.uid;
        
        messageDiv.className = `message ${isCurrentUser ? 'sent' : 'received'}`;
        
        // Format timestamp
        let timeText = 'Just now';
        if (message.timestamp) {
            if (message.timestamp.toDate) {
                const date = message.timestamp.toDate();
                timeText = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
        }
        
        messageDiv.innerHTML = `
            <div class="message-avatar">
                <img src="${message.avatar || 'img/good.png'}" alt="${message.displayName}">
            </div>
            <div class="message-content">
                <div class="message-sender">${message.displayName}</div>
                <div class="message-text">${this.escapeHtml(message.text)}</div>
                <div class="message-time">${timeText}</div>
            </div>
        `;
        
        this.messagesContainer.appendChild(messageDiv);
    }

    async sendMessage() {
        if (!this.currentUser || !this.messageInput.value.trim()) return;
        
        const messageText = this.messageInput.value.trim();
        
        try {
            await addDoc(collection(db, 'messages'), {
                text: messageText,
                userId: this.currentUser.uid,
                displayName: this.currentUser.displayName || this.currentUser.email.split('@')[0],
                email: this.currentUser.email,
                channel: this.currentChannel,
                timestamp: serverTimestamp(),
                avatar: this.currentUser.photoURL || 
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(this.currentUser.displayName || this.currentUser.email)}&background=ec4899&color=fff`
            });
            
            this.messageInput.value = '';
            this.messageInput.focus();
        } catch (error) {
            console.error('Error sending message:', error);
            alert('Failed to send message. Please try again.');
        }
    }

    switchChannel(channelItem) {
        if (!this.currentUser) {
            this.openAuthModal();
            return;
        }
        
        // Update active channel
        this.channelItems.forEach(i => i.classList.remove('active'));
        channelItem.classList.add('active');
        
        // Load new channel
        const channelId = channelItem.getAttribute('data-channel');
        this.currentChannel = channelId;
        document.getElementById('channel-title').textContent = `#${channelId}`;
        
        // Update description
        const channelDescriptions = {
            ideas: 'Share and discuss business ideas with the community',
            support: 'Get answers to your questions and help others',
            partnerships: 'Find collaborators and business partners',
            growth: 'Discuss strategies for scaling your business',
            resources: 'Share and discover helpful student resources'
        };
        
        document.getElementById('channel-description').textContent = 
            channelDescriptions[channelId] || 'Chat channel';
        
        this.loadMessages();
    }

    async loadOnlineUsers() {
        if (!this.currentUser) return;
        
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('status', '==', 'online'));
        
        onSnapshot(q, (querySnapshot) => {
            this.peopleList.innerHTML = '';
            this.onlineUsers.clear();
            
            if (querySnapshot.empty) {
                this.peopleList.innerHTML = '<div class="no-results">No users online</div>';
                return;
            }
            
            querySnapshot.forEach((doc) => {
                const user = doc.data();
                if (user.uid !== this.currentUser.uid) {
                    this.onlineUsers.add(user.uid);
                    
                    const personItem = document.createElement('li');
                    personItem.className = 'person-item';
                    personItem.innerHTML = `
                        <div class="person-avatar">
                            <img src="${user.avatar || 'img/good.png'}" alt="${user.displayName}">
                        </div>
                        <div class="person-info">
                            <h4>${user.displayName}</h4>
                            <p>${user.email}</p>
                            <div class="person-status">
                                <div class="person-status-dot online"></div>
                                <span>Online</span>
                            </div>
                        </div>
                    `;
                    
                    this.peopleList.appendChild(personItem);
                }
            });
        });
    }

    openSearch() {
        this.searchModal.classList.add('active');
        this.searchModalInput.focus();
    }

    closeSearch() {
        this.searchModal.classList.remove('active');
    }

    handleSearch() {
        const searchTerm = this.searchModalInput.value.toLowerCase().trim();
        
        if (searchTerm === '') {
            this.searchResults.innerHTML = '<div class="no-results">Enter a search term to find messages</div>';
            return;
        }
        
        const filteredMessages = this.allMessages.filter(message => 
            message.text.toLowerCase().includes(searchTerm) || 
            message.displayName.toLowerCase().includes(searchTerm)
        );
        
        if (filteredMessages.length === 0) {
            this.searchResults.innerHTML = '<div class="no-results">No messages found matching your search</div>';
        } else {
            this.searchResults.innerHTML = '';
            filteredMessages.forEach(message => {
                const resultItem = document.createElement('div');
                resultItem.className = 'search-result-item';
                resultItem.innerHTML = `
                    <div class="search-result-sender">${message.displayName}</div>
                    <div class="search-result-text">${message.text}</div>
                    <div class="message-time">${message.timestamp?.toDate?.().toLocaleTimeString() || 'Unknown time'}</div>
                `;
                this.searchResults.appendChild(resultItem);
            });
        }
    }

    clearMessageListener() {
        if (this.messageListener) {
            this.messageListener();
            this.messageListener = null;
        }
    }

    openAuthModal() {
        this.authModal.classList.add('active');
    }

    closeAuthModal() {
        this.authModal.classList.remove('active');
    }

    showLoading(element, isLoading) {
        if (isLoading) {
            element.classList.add('active');
        } else {
            element.classList.remove('active');
        }
    }

    showMessage(element, message) {
        element.textContent = message;
        element.style.display = 'block';
        setTimeout(() => {
            element.style.display = 'none';
        }, 5000);
    }

    getErrorMessage(errorCode) {
        const errorMessages = {
            'auth/email-already-in-use': 'This email is already registered',
            'auth/invalid-email': 'Invalid email address',
            'auth/operation-not-allowed': 'Email/password login is not enabled',
            'auth/weak-password': 'Password is too weak',
            'auth/user-disabled': 'This account has been disabled',
            'auth/user-not-found': 'No account found with this email',
            'auth/wrong-password': 'Incorrect password',
            'auth/too-many-requests': 'Too many attempts. Try again later',
            'auth/network-request-failed': 'Network error. Please check your connection'
        };
        
        return errorMessages[errorCode] || 'An error occurred. Please try again.';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    initLanguageSwitcher() {
        const languageLinks = document.querySelectorAll('.dropdown-menu a[data-lang]');
        languageLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const lang = link.getAttribute('data-lang');
                this.changeLanguage(lang);
            });
        });
    }

    changeLanguage(lang) {
        this.currentLang = lang;
        const translations = {
            en: {
                // Add your translations here
            }
        };
        
        // Implementation for translation
        console.log('Language changed to:', lang);
    }
}

// Initialize AuthUI when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new AuthUI();
});