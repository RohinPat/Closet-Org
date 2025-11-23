// Advanced Landing Page JavaScript with Mouse Tracking & Scroll Animations

// ============================================
// Custom Cursor
// ============================================
const cursor = {
    dot: document.querySelector('.cursor-dot'),
    outline: document.querySelector('.cursor-outline'),
    
    init() {
        if (!this.dot || !this.outline) return;
        
        let mouseX = 0, mouseY = 0;
        let dotX = 0, dotY = 0;
        let outlineX = 0, outlineY = 0;
        
        document.addEventListener('mousemove', (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
        });
        
        // Smooth cursor animation
        const animate = () => {
            // Dot follows quickly
            dotX += (mouseX - dotX) * 0.3;
            dotY += (mouseY - dotY) * 0.3;
            
            // Outline follows with delay
            outlineX += (mouseX - outlineX) * 0.15;
            outlineY += (mouseY - outlineY) * 0.15;
            
            this.dot.style.transform = `translate(${dotX - 4}px, ${dotY - 4}px)`;
            this.outline.style.transform = `translate(${outlineX - 16}px, ${outlineY - 16}px)`;
            
            requestAnimationFrame(animate);
        };
        animate();
        
        // Expand cursor on interactive elements
        const interactiveElements = document.querySelectorAll('a, button, .btn, .feature-card, .demo-card');
        
        interactiveElements.forEach(el => {
            el.addEventListener('mouseenter', () => {
                this.outline.classList.add('expand');
            });
            
            el.addEventListener('mouseleave', () => {
                this.outline.classList.remove('expand');
            });
        });
    }
};

// ============================================
// Parallax Mouse Effect
// ============================================
const parallaxEffect = {
    init() {
        const hero = document.querySelector('.hero');
        if (!hero) return;
        
        let mouseX = 0, mouseY = 0;
        let currentX = 0, currentY = 0;
        
        hero.addEventListener('mousemove', (e) => {
            const rect = hero.getBoundingClientRect();
            mouseX = ((e.clientX - rect.left) / rect.width - 0.5) * 30;
            mouseY = ((e.clientY - rect.top) / rect.height - 0.5) * 30;
        });
        
        const animate = () => {
            currentX += (mouseX - currentX) * 0.1;
            currentY += (mouseY - currentY) * 0.1;
            
            const heroContent = document.querySelector('.hero-content');
            const orbs = document.querySelectorAll('.hero-gradient-orb');
            
            if (heroContent) {
                heroContent.style.transform = `translate(${currentX * 0.5}px, ${currentY * 0.5}px)`;
            }
            
            orbs.forEach((orb, index) => {
                const speed = (index + 1) * 0.3;
                orb.style.transform = `translate(${currentX * speed}px, ${currentY * speed}px)`;
            });
            
            requestAnimationFrame(animate);
        };
        animate();
    }
};

// ============================================
// Navbar Scroll Effect
// ============================================
const navbar = {
    init() {
        const nav = document.getElementById('navbar');
        if (!nav) return;
        
        let lastScroll = 0;
        
        window.addEventListener('scroll', () => {
            const currentScroll = window.pageYOffset;
            
            if (currentScroll > 50) {
                nav.classList.add('scrolled');
            } else {
                nav.classList.remove('scrolled');
            }
            
            lastScroll = currentScroll;
        });
    }
};

// ============================================
// Scroll Reveal Animations
// ============================================
const scrollReveal = {
    init() {
        const observerOptions = {
            threshold: 0.15,
            rootMargin: '0px 0px -80px 0px'
        };
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry, index) => {
                if (entry.isIntersecting) {
                    // Add delay based on index for staggered effect
                    setTimeout(() => {
                        entry.target.classList.add('visible');
                    }, index * 100);
                    
                    // Unobserve after animation
                    observer.unobserve(entry.target);
                }
            });
        }, observerOptions);
        
        // Observe all elements with data-scroll
        document.querySelectorAll('[data-scroll]').forEach(el => {
            observer.observe(el);
        });
    }
};

// ============================================
// Smooth Scroll for Anchor Links
// ============================================
const smoothScroll = {
    init() {
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function(e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                
                if (target) {
                    const offsetTop = target.offsetTop - 80;
                    window.scrollTo({
                        top: offsetTop,
                        behavior: 'smooth'
                    });
                }
            });
        });
    }
};

// ============================================
// Counter Animation for Stats
// ============================================
const counterAnimation = {
    init() {
        const stats = document.querySelectorAll('.stat-number');
        let animated = false;
        
        const animateCounter = (element, target, duration = 2000) => {
            let current = 0;
            const increment = target / (duration / 16);
            
            const timer = setInterval(() => {
                current += increment;
                if (current >= target) {
                    element.textContent = Math.floor(target);
                    clearInterval(timer);
                } else {
                    element.textContent = Math.floor(current);
                }
            }, 16);
        };
        
        const observerOptions = {
            threshold: 0.5
        };
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !animated) {
                    animated = true;
                    
                    stats.forEach(stat => {
                        const target = parseInt(stat.getAttribute('data-target'));
                        animateCounter(stat, target);
                    });
                    
                    observer.unobserve(entry.target);
                }
            });
        }, observerOptions);
        
        const heroStats = document.querySelector('.hero-stats');
        if (heroStats) {
            observer.observe(heroStats);
        }
    }
};

// ============================================
// Magnetic Button Effect
// ============================================
const magneticButtons = {
    init() {
        const buttons = document.querySelectorAll('.btn');
        
        buttons.forEach(btn => {
            btn.addEventListener('mousemove', function(e) {
                const rect = this.getBoundingClientRect();
                const x = e.clientX - rect.left - rect.width / 2;
                const y = e.clientY - rect.top - rect.height / 2;
                
                const moveX = x * 0.3;
                const moveY = y * 0.3;
                
                this.style.transform = `translate(${moveX}px, ${moveY}px)`;
            });
            
            btn.addEventListener('mouseleave', function() {
                this.style.transform = 'translate(0, 0)';
            });
        });
    }
};

// ============================================
// Parallax Scroll Effect
// ============================================
const parallaxScroll = {
    init() {
        window.addEventListener('scroll', () => {
            const scrolled = window.pageYOffset;
            
            // Parallax for gradient orbs
            const orbs = document.querySelectorAll('.hero-gradient-orb');
            orbs.forEach((orb, index) => {
                const speed = 0.5 + (index * 0.2);
                orb.style.transform = `translateY(${scrolled * speed}px)`;
            });
            
            // Parallax for grid background
            const grid = document.querySelector('.hero-bg-grid');
            if (grid) {
                grid.style.transform = `translateY(${scrolled * 0.3}px)`;
            }
        });
    }
};

// ============================================
// Feature Cards Hover Effect
// ============================================
const featureCards = {
    init() {
        const cards = document.querySelectorAll('.feature-card');
        
        cards.forEach(card => {
            card.addEventListener('mousemove', function(e) {
                const rect = this.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                
                const rotateX = (y - centerY) / 20;
                const rotateY = (centerX - x) / 20;
                
                this.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(0)`;
            });
            
            card.addEventListener('mouseleave', function() {
                this.style.transform = '';
            });
        });
    }
};

// ============================================
// Timeline Animation Enhancement
// ============================================
const timelineEnhancement = {
    init() {
        const timelineItems = document.querySelectorAll('.timeline-item');
        
        timelineItems.forEach((item, index) => {
            item.style.transitionDelay = `${index * 0.2}s`;
        });
    }
};

// ============================================
// Gradient Text Animation
// ============================================
const gradientTextAnimation = {
    init() {
        const gradientTexts = document.querySelectorAll('.gradient-text');
        
        gradientTexts.forEach(text => {
            let angle = 0;
            
            setInterval(() => {
                angle = (angle + 1) % 360;
                text.style.filter = `hue-rotate(${angle}deg)`;
            }, 50);
        });
    }
};

// ============================================
// Interactive Demo Cards
// ============================================
const demoCards = {
    init() {
        const colorSwatches = document.querySelectorAll('.color-swatch');
        
        colorSwatches.forEach((swatch, index) => {
            swatch.addEventListener('mouseenter', function() {
                colorSwatches.forEach(s => s.style.transform = 'scale(0.9)');
                this.style.transform = 'scale(1.2)';
            });
            
            swatch.addEventListener('mouseleave', function() {
                colorSwatches.forEach(s => s.style.transform = '');
            });
        });
        
        // Category tags animation
        const categoryTags = document.querySelectorAll('.category-tag');
        categoryTags.forEach((tag, index) => {
            tag.style.animationDelay = `${index * 0.1}s`;
        });
    }
};

// ============================================
// Scroll Progress Indicator (optional enhancement)
// ============================================
const scrollProgress = {
    init() {
        const progressBar = document.createElement('div');
        progressBar.style.position = 'fixed';
        progressBar.style.top = '0';
        progressBar.style.left = '0';
        progressBar.style.height = '3px';
        progressBar.style.background = 'linear-gradient(90deg, #667eea 0%, #764ba2 50%, #f093fb 100%)';
        progressBar.style.width = '0%';
        progressBar.style.zIndex = '10001';
        progressBar.style.transition = 'width 0.2s ease';
        document.body.appendChild(progressBar);
        
        window.addEventListener('scroll', () => {
            const windowHeight = document.documentElement.scrollHeight - window.innerHeight;
            const scrolled = (window.pageYOffset / windowHeight) * 100;
            progressBar.style.width = `${scrolled}%`;
        });
    }
};

// ============================================
// Reveal on Hover - Outfit Items
// ============================================
const outfitReveal = {
    init() {
        const outfitItems = document.querySelectorAll('.outfit-item');
        
        outfitItems.forEach((item, index) => {
            item.style.opacity = '0';
            item.style.transform = 'translateY(20px)';
            
            setTimeout(() => {
                item.style.transition = 'all 0.5s ease';
                item.style.opacity = '1';
                item.style.transform = 'translateY(0)';
            }, 500 + (index * 200));
        });
    }
};

// ============================================
// Mouse Trail Effect
// ============================================
const mouseTrail = {
    particles: [],
    
    init() {
        if (window.innerWidth < 768) return; // Skip on mobile
        
        document.addEventListener('mousemove', (e) => {
            // Limit particle creation
            if (Math.random() > 0.9) {
                this.createParticle(e.clientX, e.clientY);
            }
        });
        
        this.animate();
    },
    
    createParticle(x, y) {
        const particle = document.createElement('div');
        particle.style.position = 'fixed';
        particle.style.left = x + 'px';
        particle.style.top = y + 'px';
        particle.style.width = '4px';
        particle.style.height = '4px';
        particle.style.borderRadius = '50%';
        particle.style.background = 'rgba(99, 102, 241, 0.5)';
        particle.style.pointerEvents = 'none';
        particle.style.zIndex = '9999';
        document.body.appendChild(particle);
        
        this.particles.push({
            element: particle,
            life: 1
        });
        
        // Limit particles
        if (this.particles.length > 20) {
            const removed = this.particles.shift();
            removed.element.remove();
        }
    },
    
    animate() {
        this.particles.forEach((particle, index) => {
            particle.life -= 0.02;
            particle.element.style.opacity = particle.life;
            particle.element.style.transform = `scale(${particle.life})`;
            
            if (particle.life <= 0) {
                particle.element.remove();
                this.particles.splice(index, 1);
            }
        });
        
        requestAnimationFrame(() => this.animate());
    }
};

// ============================================
// Text Reveal on Scroll
// ============================================
const textReveal = {
    init() {
        const titleLines = document.querySelectorAll('.title-line');
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.animation = 'fadeInUp 0.8s ease-out forwards';
                }
            });
        }, { threshold: 0.5 });
        
        titleLines.forEach(line => observer.observe(line));
    }
};

// ============================================
// CTA Section Magnetic Effect
// ============================================
const ctaMagnetic = {
    init() {
        const ctaBtn = document.querySelector('.btn-cta');
        const cta = document.querySelector('.cta');
        
        if (!ctaBtn || !cta) return;
        
        cta.addEventListener('mousemove', (e) => {
            const rect = ctaBtn.getBoundingClientRect();
            const btnCenterX = rect.left + rect.width / 2;
            const btnCenterY = rect.top + rect.height / 2;
            
            const distanceX = e.clientX - btnCenterX;
            const distanceY = e.clientY - btnCenterY;
            const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
            
            if (distance < 200) {
                const strength = (200 - distance) / 200;
                const moveX = distanceX * strength * 0.3;
                const moveY = distanceY * strength * 0.3;
                
                ctaBtn.style.transform = `translate(${moveX}px, ${moveY}px)`;
            } else {
                ctaBtn.style.transform = 'translate(0, 0)';
            }
        });
        
        cta.addEventListener('mouseleave', () => {
            ctaBtn.style.transform = 'translate(0, 0)';
        });
    }
};

// ============================================
// Initialize Everything
// ============================================
const initLandingPage = () => {
    // Core functionality
    cursor.init();
    navbar.init();
    scrollReveal.init();
    smoothScroll.init();
    counterAnimation.init();
    
    // Enhanced effects
    parallaxEffect.init();
    parallaxScroll.init();
    magneticButtons.init();
    featureCards.init();
    timelineEnhancement.init();
    demoCards.init();
    scrollProgress.init();
    outfitReveal.init();
    mouseTrail.init();
    textReveal.init();
    ctaMagnetic.init();
};

// ============================================
// Page Load Handler
// ============================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLandingPage);
} else {
    initLandingPage();
}

// ============================================
// Window Resize Handler
// ============================================
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        // Re-initialize certain effects on resize
        featureCards.init();
    }, 250);
});

// ============================================
// Performance Optimization
// ============================================
// Reduce motion for users who prefer it
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('*').forEach(el => {
        el.style.animation = 'none';
        el.style.transition = 'none';
    });
}

// ============================================
// Easter Egg: Konami Code
// ============================================
let konamiCode = [];
const konamiPattern = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

document.addEventListener('keydown', (e) => {
    konamiCode.push(e.key);
    konamiCode = konamiCode.slice(-10);
    
    if (konamiCode.join(',') === konamiPattern.join(',')) {
        document.body.style.animation = 'rainbow 2s linear infinite';
        
        const style = document.createElement('style');
        style.textContent = `
            @keyframes rainbow {
                0% { filter: hue-rotate(0deg); }
                100% { filter: hue-rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
        
        setTimeout(() => {
            document.body.style.animation = '';
            style.remove();
        }, 10000);
    }
});
