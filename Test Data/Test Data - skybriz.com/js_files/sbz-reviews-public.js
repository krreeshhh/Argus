(function ($) {
    'use strict';

    /**
     * Image upload preview in the admin form
     */
    function initImageUploadPreview() {
        var $input = $('#sbz_review_image');
        if (!$input.length) return;

        var $label = $('#sbz_review_image_label');
        var $preview = $('#sbz_review_image_preview');

        $input.on('change', function () {
            $preview.empty();

            var file = this.files && this.files[0];
            if (!file) {
                $label.text('📎 Upload a profile-style image (JPG/PNG/WebP)');
                return;
            }

            // Show filename
            $label.text('Selected: ' + file.name);

            // Only try preview if it’s an image
            if (!file.type || !file.type.match(/^image\//)) {
                $preview.text('File selected (not an image preview).');
                return;
            }

            // Client-side size limit (e.g. 3 MB)
            var maxSize = 3 * 1024 * 1024;
            if (file.size > maxSize) {
                $preview.text('Image too large (max 3 MB).');
                this.value = '';
                $label.text('📎 Upload a profile-style image (JPG/PNG/WebP)');
                return;
            }

            var reader = new FileReader();
            reader.onload = function (e) {
                var $img = $('<img>', {
                    src: e.target.result,
                    alt: 'Selected profile image'
                });
                $preview.append($img);
            };
            reader.readAsDataURL(file);
        });
    }

    /**
     * Front-end reviews slider (horizontal carousel)
     */
    function initSkybrizReviewsSlider($slider) {
        var $track = $slider.find('.sbz-reviews-track');
        if (!$track.length) return;

        var $cards = $track.find('.sbz-review-card');
        var $thumbs = $slider.find('.sbz-reviews-thumb');
        var $prev = $slider.find('.sbz-reviews-prev');
        var $next = $slider.find('.sbz-reviews-next');
        var $current = $slider.find('.sbz-reviews-current');
        var total = $cards.length;

        if (!total) return;

        var index = 0;
        var autoTimer = null;
        var delay = 8000; // 8 seconds

        // Layout for sliding
        $slider.addClass('sbz-reviews-slider--carousel');

        $track.css({
            display: 'flex',
            width: '100%',
            boxSizing: 'border-box',
            transition: 'transform 0.7s ease',
            willChange: 'transform'
        });

        $cards.each(function () {
            $(this).css({
                flex: '0 0 100%',
                boxSizing: 'border-box'
            });
        });

        function resetExpansionState() {
            $cards.removeClass('sbz-review-card--expanded');
            $slider.find('.sbz-review-toggle').each(function () {
                $(this)
                    .attr('aria-expanded', 'false')
                    .text('Read full review');
            });
        }

        function goTo(i, animate) {
            if (!total) return;

            index = (i + total) % total;
            var offset = -index * 100;

            if (animate === false) {
                $track.addClass('sbz-no-animate');
            } else {
                $track.removeClass('sbz-no-animate');
            }

            $track.css('transform', 'translateX(' + offset + '%)');

            // Update active states
            $cards
                .removeClass('is-active')
                .attr('aria-hidden', 'true')
                .eq(index)
                .addClass('is-active')
                .attr('aria-hidden', 'false');

            $thumbs
                .removeClass('is-active')
                .eq(index)
                .addClass('is-active');

            if ($current.length) {
                $current.text(index + 1);
            }

            resetExpansionState();
        }

        function next() { goTo(index + 1, true); }
        function prev() { goTo(index - 1, true); }

        function startAuto() {
            if ($slider.data('autoplay') === 0 || total <= 1) return;
            if (autoTimer) return;
            autoTimer = setInterval(next, delay);
        }

        function stopAuto() {
            if (autoTimer) {
                clearInterval(autoTimer);
                autoTimer = null;
            }
        }

        function restartAuto() {
            stopAuto();
            startAuto();
        }

        // Buttons
        $next.on('click', function () {
            next();
            restartAuto();
        });

        $prev.on('click', function () {
            prev();
            restartAuto();
        });

        // Thumbnails
        $thumbs.on('click', function () {
            var i = parseInt($(this).data('index'), 10);
            if (!isNaN(i)) {
                goTo(i, true);
                restartAuto();
            }
        });

        // Expand long reviews
        $slider.on('click', '.sbz-review-toggle', function () {
            var $btn = $(this);
            var $card = $btn.closest('.sbz-review-card');
            var expanded = $card.hasClass('sbz-review-card--expanded');

            if (expanded) {
                $card.removeClass('sbz-review-card--expanded');
                $btn.attr('aria-expanded', 'false').text('Read full review');
                restartAuto();
            } else {
                $card.addClass('sbz-review-card--expanded');
                $btn.attr('aria-expanded', 'true').text('Show less');
                stopAuto();
            }
        });

        // Pause on hover
        $slider.on('mouseenter focusin', stopAuto);
        $slider.on('mouseleave focusout', startAuto);

        // Initialize
        goTo(0, false);
        startAuto();
    }

    /**
     * Show/hide organization field based on role
     */
    function initOrganizationFieldLogic() {
        var $roleSelect = $('#sbz_role');
        var $orgField = $('#sbz_organization').closest('p');

        if (!$roleSelect.length || !$orgField.length) return;

        function updateOrgVisibility() {
            var val = $roleSelect.val();
            var emphasizeRoles = ['partner', 'landlord', 'property_manager'];

            // Currently always shown, but this logic allows role targeting later
            if (emphasizeRoles.indexOf(val) !== -1) {
                $orgField.show();
            } else {
                $orgField.show();
            }
        }

        updateOrgVisibility();
        $roleSelect.on('change', updateOrgVisibility);
    }

    /**
     * Live textarea counter for review field
     */
    function initReviewCharCounter() {
        var $textarea = $('#sbz_review_text');
        if (!$textarea.length) return;

        var $counter = $('#sbz_review_text_counter');
        var HARD_MAX = 1000;

        var attrMax = parseInt($textarea.attr('maxlength'), 10);
        var max = (!isNaN(attrMax) && attrMax > 0)
            ? Math.min(attrMax, HARD_MAX)
            : HARD_MAX;

        $textarea.attr('maxlength', max);

        function updateCounter() {
            var val = $textarea.val() || '';

            if (val.length > max) {
                val = val.substring(0, max);
                $textarea.val(val);
            }

            var remaining = max - val.length;
            if ($counter.length) {
                $counter.text(remaining + ' characters remaining');
            }
        }

        updateCounter();
        $textarea.on('input', updateCounter);
    }

    /**
     * ⭐ NEW: Show loading overlay when review form is submitted
     */
    function initReviewFormLoading() {
        var $form = $('.sbz-review-form');
        var $overlay = $('#sbz-review-loading-overlay');
    
        if (!$form.length || !$overlay.length) return;
    
        $form.on('submit', function () {
    
            // Disable ONLY the submit button (NOT the fields)
            $form.find('button[type="submit"]').prop('disabled', true);
    
            // Prevent user from clicking around while still submitting values
            $form.addClass('sbz-form-submitting');
    
            // Show the loading overlay
            $overlay.addClass('active');
        });
    }
    

    /**
     * Initialize all components on ready
     */
    $(document).ready(function () {
        initImageUploadPreview();
        initOrganizationFieldLogic();
        initReviewCharCounter();
        initReviewFormLoading();

        $('.sbz-reviews-slider').each(function () {
            initSkybrizReviewsSlider($(this));
        });
    });

})(jQuery);
