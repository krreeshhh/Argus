window.initPropertySlider = function initPropertySlider() {
    console.log('[Slider JS] 🔄 initPropertySlider called');
  
    const slider = document.getElementById('propertySlider');
    if (!slider) {
      console.warn('[Slider JS] ❌ #propertySlider not found in DOM');
      return;
    }
  
    const slides = slider.querySelectorAll('.slide');
    const prevBtn = slider.querySelector('.prev');
    const nextBtn = slider.querySelector('.next');
  
    if (slides.length === 0) {
      console.warn('[Slider JS] ⚠️ No .slide elements found inside #propertySlider');
      return;
    }
  
    let counter = slider.querySelector('.slide-counter');
    if (!counter) {
      counter = document.createElement('div');
      counter.className = 'slide-counter';
      slider.appendChild(counter);
      console.warn('[Slider JS] ⚠️ Counter was missing and has been created');
    }
  
    let current = 0;
  
    function showSlide(index) {
      slides.forEach((slide, i) => {
        slide.classList.toggle('active', i === index);
      });
      current = index;
      counter.textContent = `${current + 1} / ${slides.length}`;
      console.log(`[Slider JS] 📸 Showing slide ${current + 1} / ${slides.length}`);
    }
  
    function nextSlide() {
      showSlide((current + 1) % slides.length);
    }
  
    function prevSlide() {
      showSlide((current - 1 + slides.length) % slides.length);
    }
  
    showSlide(0);
  
    if (nextBtn && prevBtn) {
      nextBtn.addEventListener('click', nextSlide);
      prevBtn.addEventListener('click', prevSlide);
      console.log('[Slider JS] ✅ Navigation buttons initialized');
    } else {
      console.warn('[Slider JS] ⚠️ One or both navigation buttons not found');
    }
  
    console.log(`[Slider JS] ✅ Slider initialized with ${slides.length} slides`);
  };
  