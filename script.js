/* Portfolio 2026 — Youness Boussedari
   vanilla JS: nav, scroll spy, reveal-on-scroll, project filters + modal,
   contact form (mailto composition), local time, to-top, toasts */

/* ---------- accessibility: element refs ---------- */
const doc = document.documentElement;
const headerNav = document.querySelector('.nav');
const menuOpenBtn = document.getElementById('menu-open');
const menuCloseBtn = document.getElementById('menu-close');
const mobileMenu = document.getElementById('mobile-menu');
const navLinks = Array.from(document.querySelectorAll('.nav-links a'));
const sections = Array.from(document.querySelectorAll('main section[id]'));
const revealEls = Array.from(document.querySelectorAll('.reveal'));
const filterBtns = Array.from(document.querySelectorAll('.filter-btn'));
const projectItems = Array.from(document.querySelectorAll('.project-item'));
const modal = document.getElementById('project-modal');
const modalBackdrop = document.getElementById('modal-backdrop');
const modalCloseBtn = document.getElementById('modal-close');
const modalImage = document.getElementById('modal-image');
const modalTitle = document.getElementById('modal-title');
const modalCategory = document.getElementById('modal-category');
const modalDesc = document.getElementById('modal-desc');
const yearEl = document.getElementById('year');
const localTimeEl = document.getElementById('local-time');
const toTopBtn = document.getElementById('to-top');
const toastZone = document.getElementById('toast-zone');
const contactForm = document.getElementById('contact-form');

/* ---------- year + local time (Morocco) ---------- */
if (yearEl) yearEl.textContent = new Date().getFullYear();

function tickTime() {
    if (!localTimeEl) return;
    localTimeEl.textContent = new Date().toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Africa/Casablanca'
    });
}
tickTime();
setInterval(tickTime, 15000);

/* ---------- scrolled nav state + to-top visibility ---------- */
function onScrollChrome() {
    const y = window.scrollY;
    headerNav.classList.toggle('scrolled', y > 24);
    toTopBtn.classList.toggle('show', y > 500);
}
document.addEventListener('scroll', onScrollChrome, { passive: true });
onScrollChrome();

toTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* ---------- mobile menu ---------- */
let menuOpen = false;

function setMenu(open) {
    menuOpen = open;
    mobileMenu.classList.toggle('open', open);
    menuOpenBtn.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) menuCloseBtn.focus();
    else menuOpenBtn.focus();
}

menuOpenBtn.addEventListener('click', () => setMenu(true));
menuCloseBtn.addEventListener('click', () => setMenu(false));
Array.from(mobileMenu.querySelectorAll('nav a')).forEach((a) => {
    a.addEventListener('click', () => setMenu(false));
});

/* ---------- scroll spy ---------- */
const spyMap = navLinks.map((link) => ({ link, id: link.getAttribute('href').slice(1) }));

function onSpy() {
    const probe = window.scrollY + window.innerHeight * 0.32;
    let currentId = 'home';
    for (const s of sections) {
        if (s.offsetTop <= probe) currentId = s.id;
    }
    for (const { link, id } of spyMap) {
        link.classList.toggle('active', id === currentId);
    }
}
document.addEventListener('scroll', onSpy, { passive: true });
onSpy();

/* ---------- reveal on scroll ---------- */
const revealObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
        if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            revealObserver.unobserve(entry.target);
        }
    }
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

revealEls.forEach((el) => revealObserver.observe(el));

/* ---------- project filters ---------- */
filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
        filterBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const f = btn.dataset.filter;
        for (const item of projectItems) {
            const cats = (item.dataset.cats || '').split(' ').filter(Boolean);
            const show = f === 'all' || cats.includes(f);
            item.style.display = show ? '' : 'none';
        }
    });
});

/* ---------- project modal ---------- */
let lastTrigger = null;

function openModal(trigger) {
    lastTrigger = trigger;
    modalTitle.textContent = trigger.dataset.title;
    modalCategory.textContent = trigger.dataset.category;
    modalDesc.textContent = trigger.dataset.desc;
    modalImage.src = trigger.dataset.image;
    modalImage.alt = `Preview — ${trigger.dataset.title}`;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    modalCloseBtn.focus();
}

function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastTrigger) lastTrigger.focus();
    lastTrigger = null;
}

Array.from(document.querySelectorAll('.project-card')).forEach((card) => {
    card.addEventListener('click', (e) => {
        e.preventDefault();
        openModal(card);
    });
});

modalCloseBtn.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', closeModal);

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (modal.classList.contains('open')) closeModal();
        if (menuOpen) setMenu(false);
    }

    /* light focus trap inside the modal */
    if (e.key === 'Tab' && modal.classList.contains('open')) {
        const focusables = modal.querySelectorAll('button, a[href], input, textarea');
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }
});

/* ---------- toasts ---------- */
const ICON_OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_ERR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16v.1" stroke-linecap="round"/></svg>';

function showToast(message, type = 'ok') {
    const box = document.createElement('div');
    box.className = 'toast' + (type === 'err' ? ' err' : '');
    box.innerHTML = `${type === 'err' ? ICON_ERR : ICON_OK}<span></span>`;
    box.querySelector('span').textContent = message;
    toastZone.appendChild(box);
    window.setTimeout(() => {
        box.style.opacity = '0';
        window.setTimeout(() => box.remove(), 260);
    }, 3200);
}

/* ---------- contact form -> mailto composition ---------- */
contactForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const name = contactForm.elements.name.value.trim();
    const email = contactForm.elements.email.value.trim();
    const message = contactForm.elements.message.value.trim();

    if (!name || !email || !message) {
        showToast('Please fill in your name, email and message.', 'err');
        return;
    }

    const subject = encodeURIComponent(`Portfolio contact — ${name}`);
    const body = encodeURIComponent(`${message}\n\n— ${name} (${email})`);
    window.location.href =
        `mailto:younessboussedari2025@gmail.com?subject=${subject}&body=${body}`;

    showToast('Opening your email app…');
    contactForm.reset();
});
