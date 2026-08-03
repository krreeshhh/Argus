document.addEventListener('DOMContentLoaded', () => {
    const slider = document.getElementById('chronicleSlider');
    if (!slider) return;
  
    const slides = slider.querySelectorAll('.chronicle-slide');
    const prevBtn = slider.querySelector('.prev');
    const nextBtn = slider.querySelector('.next');
    let current = 0;
    let interval;
  
    function showSlide(index) {
      slides.forEach((slide, i) => {
        slide.classList.toggle('active', i === index);
      });
      current = index;
    }
  
    function nextSlide() {
      showSlide((current + 1) % slides.length);
    }
  
    function prevSlide() {
      showSlide((current - 1 + slides.length) % slides.length);
    }
  
    function resetTimer() {
      clearInterval(interval);
      interval = setInterval(nextSlide, 5000);
    }
  
    if (slides.length > 0) {
      showSlide(0);
      interval = setInterval(nextSlide, 5000);
      nextBtn.addEventListener('click', () => { nextSlide(); resetTimer(); });
      prevBtn.addEventListener('click', () => { prevSlide(); resetTimer(); });
    }
  });
  