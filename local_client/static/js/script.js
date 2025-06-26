// local_client/static/js/script.js

document.addEventListener("DOMContentLoaded", function() {
    
    // --- Canvas Smoke Effect ---
    const canvas = document.getElementById('smoke-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        let particles = [];
        let particleCount = 75;
        let animationFrameId;

        function setCanvasSize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }

        class Particle {
            constructor() {
                this.reset();
                this.x = Math.random() * canvas.width;
            }

            reset() {
                this.x = canvas.width + Math.random() * 100;
                this.y = Math.random() * canvas.height;
                this.size = Math.random() * 50 + 20;
                this.speedX = -Math.random() * 0.8 - 0.2;
                this.speedY = (Math.random() - 0.5) * 0.4;
                this.opacity = Math.random() * 0.1 + 0.02;
            }

            update() {
                this.x += this.speedX;
                this.y += this.speedY;
                if (this.x < -this.size) {
                    this.reset();
                }
            }

            draw() {
                ctx.beginPath();
                const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size);
                gradient.addColorStop(0, `rgba(40, 90, 160, ${this.opacity})`);
                gradient.addColorStop(1, `rgba(40, 90, 160, 0)`);
                ctx.fillStyle = gradient;
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        function initParticles() {
            particles = [];
            for (let i = 0; i < particleCount; i++) {
                particles.push(new Particle());
            }
        }

        function animate() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (let i = 0; i < particles.length; i++) {
                particles[i].update();
                particles[i].draw();
            }
            animationFrameId = requestAnimationFrame(animate);
        }
        
        function startAnimation() {
            setCanvasSize();
            initParticles();
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
            animate();
        }

        startAnimation();
        window.addEventListener('resize', startAnimation);
    }
});