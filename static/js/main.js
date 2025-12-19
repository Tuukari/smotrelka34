const gallery = document.getElementById('gallery');
const loading = document.getElementById('loading');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');

// Header Elements
const mobileSearchToggle = document.getElementById('mobile-search-toggle');
const searchContainer = document.getElementById('search-container');
const sourceDropdownBtn = document.getElementById('source-dropdown-btn');
const sourceDropdownMenu = document.getElementById('source-dropdown-menu');
const sourceOptions = document.querySelectorAll('.source-option');
const currentSourceText = document.getElementById('current-source-text');
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const closeBtn = document.querySelector('.close-btn');
const burgerBtn = document.getElementById('burger-btn');
const sidebar = document.getElementById('sidebar');
const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view');
const toast = document.getElementById('toast');

// Post Details Elements
const postView = document.getElementById('post-view');
const backToGalleryBtn = document.getElementById('back-to-gallery-btn');
const postImageDetail = document.getElementById('post-image-detail');
const postTags = document.getElementById('post-tags');
const postSourceLabel = document.getElementById('post-source-label');
const postResolution = document.getElementById('post-resolution');
const downloadBtn = document.getElementById('download-btn');
const postImageContainer = document.querySelector('.post-image-container');

// Profile & Settings
const profileAvatar = document.getElementById('profile-avatar');
const editAvatarBtn = document.getElementById('edit-avatar-btn');
const profileNickname = document.getElementById('profile-nickname');
const openSettingsBtn = document.getElementById('open-settings-btn');
const columnCountSlider = document.getElementById('column-count-slider');
const columnCountValue = document.getElementById('column-count-value');


// State
let page = 1;
let isLoading = false;
let currentSource = 'safebooru';
let currentTags = '';
let endOfResults = false;
let currentUser = null;
let likedPostIds = new Set();
let savedPostIds = new Set();

// Initial Load
window.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    checkAuth(); // Check auth first
    fetchPosts();
});

async function checkAuth() {
    try {
        const res = await fetch('/api/user');
        const data = await res.json();
        if (data.is_logged_in) {
            currentUser = data;
            updateAuthUI(true);
            // Fetch interactions to sync buttons
            await fetchUserInteractions();
        } else {
            updateAuthUI(false);
        }
    } catch (e) {
        console.error("Auth check failed", e);
    }
}

async function fetchUserInteractions() {
    if (!currentUser) return;
    try {
        // Fetch likes
        const likesRes = await fetch('/api/user/likes');
        const likes = await likesRes.json();
        likedPostIds = new Set(likes.map(p => p.id));

        // Fetch saves
        const savesRes = await fetch('/api/user/saved');
        const saves = await savesRes.json();
        savedPostIds = new Set(saves.map(p => p.id));

        // Update Recent Likes on Profile
        renderRecentLikes(likes);

    } catch (e) { console.error(e); }
}

// Settings Logic
function loadSettings() {
    const savedCols = localStorage.getItem('columnCount') || 3;
    if (columnCountSlider) {
        columnCountSlider.value = savedCols;
        updateGridColumns(savedCols);
    }
}

if (columnCountSlider) {
    columnCountSlider.addEventListener('input', (e) => {
        updateGridColumns(e.target.value);
    });
}

function updateGridColumns(val) {
    if (columnCountValue) columnCountValue.textContent = val;
    document.documentElement.style.setProperty('--mobile-column-count', val);
    localStorage.setItem('columnCount', val);
}

// === Auth UI Logic ===
const authSection = document.getElementById('auth-section');
const userProfileSection = document.getElementById('user-profile-section');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const showRegisterBtn = document.getElementById('show-register-btn');
const showLoginBtn = document.getElementById('show-login-btn');
const loginSubmitBtn = document.getElementById('login-submit-btn');
const registerSubmitBtn = document.getElementById('register-submit-btn');
const logoutBtn = document.getElementById('logout-btn');

function updateAuthUI(isLoggedIn) {
    if (isLoggedIn) {
        authSection.classList.add('hidden');
        userProfileSection.classList.remove('hidden');
        if (profileNickname) profileNickname.textContent = currentUser.username;
        if (profileAvatar) profileAvatar.src = currentUser.avatar;
    } else {
        authSection.classList.remove('hidden');
        userProfileSection.classList.add('hidden');
    }
}

if (showRegisterBtn) showRegisterBtn.addEventListener('click', () => {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
});

if (showLoginBtn) showLoginBtn.addEventListener('click', () => {
    registerForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
});

if (loginSubmitBtn) loginSubmitBtn.addEventListener('click', async () => {
    const u = document.getElementById('login-username').value;
    const p = document.getElementById('login-password').value;
    const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p })
    });
    if (res.ok) {
        checkAuth();
    } else {
        alert('Login failed');
    }
});

if (registerSubmitBtn) registerSubmitBtn.addEventListener('click', async () => {
    const u = document.getElementById('register-username').value;
    const p = document.getElementById('register-password').value;
    const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p })
    });
    if (res.ok) {
        checkAuth();
    } else {
        alert('Registration failed');
    }
});

if (logoutBtn) logoutBtn.addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    currentUser = null;
    likedPostIds.clear();
    savedPostIds.clear();
    updateAuthUI(false);
    window.location.reload(); // Reload to clear gallery state if needed
});

if (openSettingsBtn) {
    openSettingsBtn.addEventListener('click', () => {
        navigateTo('settings');
    });
}

function renderRecentLikes(likes) {
    const grid = document.getElementById('recent-likes-grid');
    if (!grid) return;
    grid.innerHTML = '';
    if (likes.length === 0) {
        grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #aaa;">No likes yet</p>';
        return;
    }
    likes.slice(0, 6).forEach(post => {
        const item = document.createElement('div');
        item.className = 'recent-item';
        item.innerHTML = `<img src="${post.preview_url}" loading="lazy">`;
        item.addEventListener('click', () => openPostDetails(post));
        grid.appendChild(item);
    });
}

// Event Listeners
if (searchBtn) searchBtn.addEventListener('click', handleSearch);
if (searchInput) {
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });
}

// Mobile Search Toggle
if (mobileSearchToggle) {
    mobileSearchToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        searchContainer.classList.toggle('active');
        if (searchContainer.classList.contains('active')) {
            if (searchInput) searchInput.focus();
        }
    });
}

document.addEventListener('click', (e) => {
    if (searchContainer && searchContainer.classList.contains('active')) {
        if (!searchContainer.contains(e.target) && !mobileSearchToggle.contains(e.target)) {
            searchContainer.classList.remove('active');
        }
    }
});

// Source Dropdown Logic
if (sourceDropdownBtn) {
    sourceDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sourceDropdownMenu.classList.toggle('hidden');
    });
}

document.addEventListener('click', (e) => {
    if (sourceDropdownMenu && !sourceDropdownMenu.classList.contains('hidden')) {
        if (!sourceDropdownMenu.contains(e.target) && !sourceDropdownBtn.contains(e.target)) {
            sourceDropdownMenu.classList.add('hidden');
        }
    }
});

// Source Selection
sourceOptions.forEach(option => {
    option.addEventListener('click', () => {
        const newSource = option.dataset.source;

        // Update UI
        sourceOptions.forEach(opt => opt.classList.remove('active'));
        option.classList.add('active');

        // Update Trigger Text
        if (currentSourceText) {
            currentSourceText.textContent = newSource.charAt(0).toUpperCase() + newSource.slice(1);
        }

        sourceDropdownMenu.classList.add('hidden');

        if (currentSource !== newSource) {
            currentSource = newSource;
            resetGallery();
            fetchPosts();
        }
    });
});

// Navigation Logic (SPA)
navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const targetPage = item.dataset.page;
        navigateTo(targetPage);
    });
});

function navigateTo(pageId) {
    navItems.forEach(nav => {
        if (nav.dataset.page === pageId) nav.classList.add('active');
        else if (pageId === 'settings' && nav.dataset.page === 'profile') nav.classList.add('active');
        else if (pageId === 'post') { } // Do nothing for post view nav state
        else nav.classList.remove('active');
    });

    views.forEach(view => {
        view.classList.remove('active');
        view.classList.add('hidden');
    });

    let viewId = pageId + '-view';
    if (pageId === 'home') viewId = 'home-view';
    if (pageId === 'saved') {
        viewId = 'saved-view';
        loadSavedContent('saved'); // Load default tab
    }
    if (pageId === 'profile') viewId = 'profile-view';
    if (pageId === 'settings') viewId = 'settings-view';
    if (pageId === 'post') viewId = 'post-view';

    const targetView = document.getElementById(viewId);
    if (targetView) {
        targetView.classList.remove('hidden');
        targetView.classList.add('active');
    }

    if (sidebar) sidebar.classList.remove('active');
}

// Post Details Logic
let currentPost = null;

if (backToGalleryBtn) {
    backToGalleryBtn.addEventListener('click', () => {
        navigateTo('home');
    });
}

if (postImageContainer) {
    postImageContainer.addEventListener('click', () => {
        const url = postImageDetail.src;
        openLightbox(url);
    });
}

function openPostDetails(post) {
    currentPost = post; // Store for actions

    // Populate data
    postImageDetail.src = post.file_url;
    postSourceLabel.textContent = currentSource;
    postResolution.textContent = `${post.width}x${post.height}`;

    // Tags
    postTags.innerHTML = '';
    const tags = post.tags.split(' ');
    tags.forEach(tag => {
        const span = document.createElement('span');
        span.className = 'tag-pill';
        span.textContent = tag;
        postTags.appendChild(span);
    });

    // Update Action Buttons
    updateActionButtons();

    // Show View
    navigateTo('post');
}

function updateActionButtons() {
    const likeBtn = document.getElementById('like-btn');
    const saveBtn = document.getElementById('save-btn');

    // Reset
    likeBtn.classList.remove('active');
    saveBtn.classList.remove('active');
    likeBtn.innerHTML = '<i class="fa-regular fa-heart"></i> Like';
    saveBtn.innerHTML = '<i class="fa-regular fa-bookmark"></i> Save';

    // Check State
    if (currentUser && currentPost) {
        if (likedPostIds.has(currentPost.id)) {
            likeBtn.classList.add('active');
            likeBtn.innerHTML = '<i class="fa-solid fa-heart"></i> Liked';
        }
        if (savedPostIds.has(currentPost.id)) {
            saveBtn.classList.add('active');
            saveBtn.innerHTML = '<i class="fa-solid fa-bookmark"></i> Saved';
        }
    }
}

// Action Handlers
const likeBtn = document.getElementById('like-btn');
const saveBtn = document.getElementById('save-btn');
// downloadBtn already declared at top

if (likeBtn) likeBtn.addEventListener('click', async () => {
    if (!currentUser) return alert('Please login to like posts');
    if (!currentPost) return;

    try {
        const res = await fetch('/api/like', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image_url: currentPost.file_url,
                thumbnail_url: currentPost.preview_url,
                source: currentSource,
                post_id: currentPost.id
            })
        });
        const data = await res.json();
        if (data.liked) likedPostIds.add(currentPost.id);
        else likedPostIds.delete(currentPost.id);
        updateActionButtons();
        fetchUserInteractions(); // refresh profile lists
    } catch (e) { console.error(e); }
});

if (saveBtn) saveBtn.addEventListener('click', async () => {
    if (!currentUser) return alert('Please login to save posts');
    if (!currentPost) return;

    try {
        const res = await fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image_url: currentPost.file_url,
                thumbnail_url: currentPost.preview_url,
                source: currentSource,
                post_id: currentPost.id
            })
        });
        const data = await res.json();
        if (data.saved) savedPostIds.add(currentPost.id);
        else savedPostIds.delete(currentPost.id);
        updateActionButtons();
        fetchUserInteractions();
    } catch (e) { console.error(e); }
});

if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
        if (currentPost) {
            const a = document.createElement('a');
            a.href = currentPost.file_url;
            a.download = `image_${currentPost.id}.jpg`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
    });
}

// === Saved View Logic ===
const savedTabs = document.querySelectorAll('.tab-btn');
const savedGallery = document.getElementById('saved-gallery');

savedTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        savedTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        loadSavedContent(tab.dataset.tab);
    });
});

async function loadSavedContent(type) {
    if (!currentUser) {
        savedGallery.innerHTML = '<div class="placeholder-container"><p>Please login first</p></div>';
        return;
    }

    savedGallery.innerHTML = '<div class="loading-spinner"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';

    try {
        const endpoint = type === 'liked' ? '/api/user/likes' : '/api/user/saved';
        const res = await fetch(endpoint);
        const posts = await res.json();

        savedGallery.innerHTML = '';
        if (posts.length === 0) {
            savedGallery.innerHTML = '<div class="placeholder-container"><p>No items found</p></div>';
            return;
        }

        posts.forEach(post => {
            const item = document.createElement('div');
            item.className = 'gallery-item';
            item.innerHTML = `<img src="${post.preview_url}" loading="lazy">`;
            item.addEventListener('click', () => {
                currentSource = post.source; // Switch context so subsequent actions use correct source
                openPostDetails(post);
            });
            savedGallery.appendChild(item);
        });

    } catch (e) {
        savedGallery.innerHTML = '<div class="placeholder-container"><p>Error loading content</p></div>';
    }
}

// Burger Menu
if (burgerBtn) {
    burgerBtn.addEventListener('click', () => {
        if (sidebar) sidebar.classList.toggle('active');
    });
}

// Close sidebar on outside click
document.addEventListener('click', (e) => {
    if (sidebar && sidebar.classList.contains('active') &&
        !sidebar.contains(e.target) &&
        !burgerBtn.contains(e.target)) {
        sidebar.classList.remove('active');
    }
});

// Toast Notification
function showToast(msg) {
    if (toast) {
        if (msg) {
            toast.innerHTML = `<i class="fa-solid fa-info-circle"></i> ${msg}`;
        } else {
            toast.innerHTML = `<i class="fa-solid fa-info-circle"></i> In Development`;
        }
        toast.classList.remove('hidden');
        setTimeout(() => {
            toast.classList.add('hidden');
        }, 3000);
    }
}

// Infinite Scroll
window.addEventListener('scroll', () => {
    const homeView = document.getElementById('home-view');
    if (!homeView || !homeView.classList.contains('active')) return;

    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500 && !isLoading && !endOfResults) {
        page++;
        fetchPosts();
    }
});

function handleSearch() {
    if (searchInput) {
        currentTags = searchInput.value.trim();
        resetGallery();
        fetchPosts();
    }
}

function resetGallery() {
    if (gallery) {
        gallery.innerHTML = '';
        page = 1;
        endOfResults = false;
    }
}

async function fetchPosts() {
    if (isLoading) return;
    isLoading = true;
    if (loading) loading.classList.remove('hidden');

    try {
        const response = await fetch(`/api/posts?source=${currentSource}&page=${page}&tags=${encodeURIComponent(currentTags)}`);
        const posts = await response.json();

        if (posts.length === 0) {
            endOfResults = true;
        } else {
            renderPosts(posts);
        }
    } catch (error) {
        console.error('Error fetching posts:', error);
    } finally {
        isLoading = false;
        if (loading) loading.classList.add('hidden');
    }
}

function renderPosts(posts) {
    posts.forEach(post => {
        const item = document.createElement('div');
        item.className = 'gallery-item';

        const img = document.createElement('img');
        img.src = post.preview_url;
        img.loading = 'lazy';

        item.appendChild(img);
        if (gallery) gallery.appendChild(item);

        // Change click behavior to open details instead of lightbox directly
        item.addEventListener('click', () => openPostDetails(post));
    });
}

// Lightbox (Full Screen Viewer)
function openLightbox(url) {
    if (lightbox && lightboxImg) {
        lightbox.classList.remove('hidden');
        lightboxImg.src = url;
    }
}

if (closeBtn) {
    closeBtn.addEventListener('click', () => {
        if (lightbox && lightboxImg) {
            lightbox.classList.add('hidden');
            lightboxImg.src = '';
        }
    });
}

if (lightbox) {
    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) {
            lightbox.classList.add('hidden');
            if (lightboxImg) lightboxImg.src = '';
        }
    });
}

if (editAvatarBtn) {
    editAvatarBtn.addEventListener('click', async () => {
        const url = prompt("Please enter the URL for your new avatar image:");
        if (url) {
            try {
                const res = await fetch('/api/user/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ avatar_url: url })
                });

                if (res.ok) {
                    const data = await res.json();
                    currentUser.avatar = data.avatar;
                    // Update UI immediately
                    if (profileAvatar) profileAvatar.src = data.avatar;
                    showToast('Avatar updated!');
                } else {
                    showToast('Failed to update avatar');
                }
            } catch (e) {
                console.error(e);
                showToast('Error updating avatar');
            }
        }
    });
}
