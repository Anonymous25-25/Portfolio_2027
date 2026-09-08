// === PRELOADER ===
window.addEventListener('load', () => {
    const preloader = document.getElementById('preloader');
    setTimeout(() => {
        preloader.classList.add('hide');
        setTimeout(() => {
            preloader.style.display = 'none';
        }, 600);
    }, 1000); 
    
    document.getElementById('year').textContent = new Date().getFullYear();
    updateTime();
    setInterval(updateTime, 1000);
});

// === LOCAL TIME LOGIC ===
function updateTime() {
    const timeDisplay = document.getElementById('local-time');
    if(timeDisplay) {
        const now = new Date();
        timeDisplay.textContent = now.toLocaleTimeString('id-ID', {
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false
        });
    }
}

// === DARK MODE LOGIC ===
const themeToggle = document.getElementById('theme-toggle');
const html = document.documentElement;

if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    html.classList.add('dark');
    themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
} else {
    html.classList.remove('dark');
    themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
}

themeToggle.addEventListener('click', () => {
    html.classList.toggle('dark');
    if (html.classList.contains('dark')) {
        localStorage.theme = 'dark';
        themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    } else {
        localStorage.theme = 'light';
        themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
    }
});

// === MOBILE MENU ===
const btn = document.getElementById('mobile-menu-btn');
const menu = document.getElementById('mobile-menu');
const closeBtn = document.getElementById('close-menu');
const links = document.querySelectorAll('.mobile-link');

const toggleMenu = () => {
    const isOpen = menu.style.opacity === '1';
    menu.style.opacity = isOpen ? '0' : '1';
    menu.style.pointerEvents = isOpen ? 'none' : 'auto';
};

btn.addEventListener('click', toggleMenu);
closeBtn.addEventListener('click', toggleMenu);
links.forEach(link => link.addEventListener('click', toggleMenu));

// === SCROLL TO TOP & ACTIVE NAVIGATION (ScrollSpy) ===
const scrollToTopBtn = document.getElementById('scrollToTopBtn');
const sections = document.querySelectorAll('.section-spy');
const navLinks = document.querySelectorAll('.nav-link');

window.addEventListener('scroll', () => {
    if (window.scrollY > 300) {
        scrollToTopBtn.classList.remove('translate-y-20', 'opacity-0');
    } else {
        scrollToTopBtn.classList.add('translate-y-20', 'opacity-0');
    }

    let current = '';
    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        if (pageYOffset >= (sectionTop - 200)) {
            current = section.getAttribute('id');
        }
    });

    navLinks.forEach(link => {
        link.classList.remove('text-primary', 'dark:text-white', 'font-bold');
        link.classList.add('text-slate-600', 'dark:text-slate-400');
        if (link.getAttribute('href').includes(current)) {
            link.classList.add('text-primary', 'dark:text-white', 'font-bold');
            link.classList.remove('text-slate-600', 'dark:text-slate-400');
        }
    });
});

scrollToTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

// === PROJECT FILTER LOGIC ===
const filterBtns = document.querySelectorAll('.filter-btn');
const projects = document.querySelectorAll('.project-item');

filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const filterValue = btn.getAttribute('data-filter');

        projects.forEach(project => {
            const categories = project.getAttribute('data-filter-category').split(' ');
            
            if (filterValue === 'all' || categories.includes(filterValue)) {
                project.style.display = 'block';
                project.classList.add('reveal-on-scroll', 'is-visible');
            } else {
                project.style.display = 'none';
                project.classList.remove('reveal-on-scroll', 'is-visible');
            }
        });
    });
});

// === 3D TILT EFFECT ===
if (window.matchMedia("(min-width: 768px)").matches) {
    const cards = document.querySelectorAll('.project-card');
    cards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const rotateX = ((y - centerY) / centerY) * -3; 
            const rotateY = ((x - centerX) / centerX) * 3;
            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.01, 1.01, 1.01)`;
        });
        card.addEventListener('mouseleave', () => {
            card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale3d(1, 1, 1)';
        });
    });
}

// === PARALLAX EFFECT ===
window.addEventListener('scroll', () => {
    const parallaxImages = document.querySelectorAll('.parallax-img');
    parallaxImages.forEach(img => {
        const rect = img.parentElement.getBoundingClientRect();
        const isVisible = rect.top < window.innerHeight && rect.bottom > 0;
        if (isVisible) {
            const speed = 0.08;
            const yPos = (window.innerHeight - rect.top) * speed;
            img.style.transform = `translateY(${yPos - 20}px) scale(1.1)`;
        }
    });
});

// === PROJECT MODAL LOGIC ===
const modal = document.getElementById('project-modal');
const modalBackdrop = document.getElementById('modal-backdrop');
const modalContent = document.getElementById('modal-content');
const closeModal = document.getElementById('close-modal');
const triggers = document.querySelectorAll('.project-trigger');

const mTitle = document.getElementById('modal-title');
const mCategory = document.getElementById('modal-category');
const mImage = document.getElementById('modal-image');
const mDesc = document.getElementById('modal-desc');

function openModal(data) {
    mTitle.textContent = data.title;
    mCategory.textContent = data.category;
    mImage.src = data.image;
    mDesc.textContent = data.desc;

    modal.classList.remove('hidden');
    setTimeout(() => {
        modalBackdrop.classList.remove('opacity-0');
        modalContent.classList.remove('scale-95', 'opacity-0');
        modalContent.classList.add('scale-100', 'opacity-100');
    }, 10);
    document.body.style.overflow = 'hidden'; 
}

function hideModal() {
    modalBackdrop.classList.add('opacity-0');
    modalContent.classList.remove('scale-100', 'opacity-100');
    modalContent.classList.add('scale-95', 'opacity-0');
    
    setTimeout(() => {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }, 300);
}

triggers.forEach(trigger => {
    trigger.addEventListener('click', () => {
        const data = {
            title: trigger.dataset.title,
            category: trigger.dataset.category,
            image: trigger.dataset.image,
            desc: trigger.dataset.desc
        };
        openModal(data);
    });
});

closeModal.addEventListener('click', hideModal);
modalBackdrop.addEventListener('click', hideModal);
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideModal();
});

// === TOAST NOTIFICATION LOGIC ===
const toastContainer = document.getElementById('toast-container');
const contactForm = document.getElementById('contact-form');

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    
    const icon = type === 'success' ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-exclamation-circle"></i>';
    const colorClass = type === 'success' ? 'bg-slate-900 text-white dark:bg-white dark:text-black' : 'bg-red-500 text-white';

    toast.className = `flex items-center gap-3 px-6 py-4 rounded-xl shadow-2xl font-medium text-sm toast-enter toast-enter-active ${colorClass}`;
    toast.innerHTML = `${icon} <span>${message}</span>`;

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.remove('toast-enter-active');
        toast.classList.add('toast-exit-active');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

contactForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const originalText = btn.innerHTML;
    
    btn.innerHTML = '<i class="fas fa-circle-notch animate-spin"></i> Mengirim...';
    btn.disabled = true;

    setTimeout(() => {
        showToast('Pesan berhasil dikirim! Kami akan segera menghubungi Anda.');
        e.target.reset();
        btn.innerHTML = originalText;
        btn.disabled = false;
    }, 1500);
});

// === SCROLL REVEAL ANIMATION [MODERN] ===
const observerOptions = {
    threshold: 0.1,
    rootMargin: "0px 0px -50px 0px"
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target); 
        }
    });
}, observerOptions);

document.querySelectorAll('.reveal-on-scroll').forEach((el) => {
    observer.observe(el);
});

// === MAGNETIC BUTTON EFFECT ===
const magneticBtns = document.querySelectorAll('.magnetic-btn');

if (window.matchMedia("(min-width: 768px)").matches) {
    magneticBtns.forEach(btn => {
        btn.addEventListener('mousemove', (e) => {
            const rect = btn.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;
            
            btn.style.transform = `translate(${x * 0.2}px, ${y * 0.2}px)`;
        });

        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'translate(0px, 0px)';
        });
    });
}

// === SPOTLIGHT EFFECT LOGIC [NEW] ===
const spotlightCards = document.querySelectorAll('.spotlight-card');

spotlightCards.forEach(card => {
    card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        card.style.setProperty('--mouse-x', `${x}px`);
        card.style.setProperty('--mouse-y', `${y}px`);

        
    });
});
