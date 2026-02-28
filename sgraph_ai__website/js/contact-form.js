/* ============================================================
   SGraph AI — Contact Form & Modal
   Handles the contact modal and both modal + page contact forms.
   MVP: constructs a mailto: link to sherpa@sgraph.ai.
   ============================================================ */

(function () {
  'use strict';

  // ----------------------------------------------------------
  // Constants
  // ----------------------------------------------------------
  var SHERPA_EMAIL     = 'sherpa@sgraph.ai';
  var MIN_MESSAGE_LEN  = 10;
  var MAX_MESSAGE_LEN  = 5000;
  var EMAIL_REGEX      = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // ----------------------------------------------------------
  // Modal: Open / Close
  // ----------------------------------------------------------

  /**
   * Opens the contact modal overlay.
   */
  function openContactModal() {
    var overlay = document.getElementById('contact-modal');
    if (!overlay) return;

    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');

    // Focus the message textarea
    var textarea = overlay.querySelector('textarea');
    if (textarea) {
      setTimeout(function () { textarea.focus(); }, 100);
    }

    // Prevent body scroll
    document.body.style.overflow = 'hidden';
  }

  /**
   * Closes the contact modal overlay and resets its form.
   */
  function closeContactModal() {
    var overlay = document.getElementById('contact-modal');
    if (!overlay) return;

    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');

    // Restore body scroll
    document.body.style.overflow = '';

    // Reset modal form
    var form = document.getElementById('contact-form-modal');
    if (form) {
      form.reset();
      clearErrors(form);
      hideAlert('modal-alert');
    }
  }

  // Expose globally
  window.openContactModal  = openContactModal;
  window.closeContactModal = closeContactModal;

  // ----------------------------------------------------------
  // Escape key & overlay click
  // ----------------------------------------------------------

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeContactModal();
    }
  });

  document.addEventListener('click', function (e) {
    if (e.target && e.target.id === 'contact-modal') {
      closeContactModal();
    }
  });

  // ----------------------------------------------------------
  // Validation helpers
  // ----------------------------------------------------------

  /**
   * Validates a message string.
   * @param {string} message
   * @returns {string|null} Error message or null if valid.
   */
  function validateMessage(message) {
    if (!message || message.trim().length === 0) {
      return 'Message is required.';
    }
    var trimmed = message.trim();
    if (trimmed.length < MIN_MESSAGE_LEN) {
      return 'Message must be at least ' + MIN_MESSAGE_LEN + ' characters.';
    }
    if (trimmed.length > MAX_MESSAGE_LEN) {
      return 'Message must be no more than ' + MAX_MESSAGE_LEN + ' characters.';
    }
    return null;
  }

  /**
   * Validates an email string (only if provided).
   * @param {string} email
   * @returns {string|null} Error message or null if valid.
   */
  function validateEmail(email) {
    if (!email || email.trim().length === 0) {
      return null; // email is optional
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      return 'Please enter a valid email address.';
    }
    return null;
  }

  // ----------------------------------------------------------
  // DOM helpers
  // ----------------------------------------------------------

  /**
   * Shows an error message below a field.
   * @param {string} errorId  ID of the error paragraph element.
   * @param {string} message  Error text to display.
   */
  function showFieldError(errorId, message) {
    var el = document.getElementById(errorId);
    if (!el) return;
    el.textContent = message;
    el.classList.remove('hidden');
  }

  /**
   * Hides an error message.
   * @param {string} errorId  ID of the error paragraph element.
   */
  function hideFieldError(errorId) {
    var el = document.getElementById(errorId);
    if (!el) return;
    el.textContent = '';
    el.classList.add('hidden');
  }

  /**
   * Clears all error messages within a form.
   * @param {HTMLFormElement} form
   */
  function clearErrors(form) {
    var errors = form.querySelectorAll('.form-error');
    for (var i = 0; i < errors.length; i++) {
      errors[i].textContent = '';
      errors[i].classList.add('hidden');
    }
  }

  /**
   * Shows an alert (success or error) in a container.
   * @param {string} containerId  ID of the alert div.
   * @param {string} type         'success' or 'error'.
   * @param {string} message      Alert text.
   */
  function showAlert(containerId, type, message) {
    var el = document.getElementById(containerId);
    if (!el) return;
    el.className = 'alert alert--' + type;
    el.textContent = message;
  }

  /**
   * Hides an alert container.
   * @param {string} containerId  ID of the alert div.
   */
  function hideAlert(containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;
    el.className = 'hidden';
    el.textContent = '';
  }

  // ----------------------------------------------------------
  // Form submission
  // ----------------------------------------------------------

  /**
   * Handles form submission for both modal and page forms.
   * @param {Event} e                  Submit event.
   * @param {string} messageFieldId    ID of the message textarea.
   * @param {string} emailFieldId      ID of the email input.
   * @param {string} messageErrorId    ID of the message error element.
   * @param {string} emailErrorId      ID of the email error element.
   * @param {string} alertId           ID of the alert container.
   * @param {string} pageValue         Which page the user is on.
   */
  function handleSubmit(e, messageFieldId, emailFieldId, messageErrorId, emailErrorId, alertId, pageValue) {
    e.preventDefault();

    var messageEl = document.getElementById(messageFieldId);
    var emailEl   = document.getElementById(emailFieldId);

    if (!messageEl) return;

    var message = messageEl.value;
    var email   = emailEl ? emailEl.value : '';

    // Clear previous errors
    hideFieldError(messageErrorId);
    hideFieldError(emailErrorId);
    hideAlert(alertId);

    // Validate
    var messageError = validateMessage(message);
    var emailError   = validateEmail(email);
    var hasErrors    = false;

    if (messageError) {
      showFieldError(messageErrorId, messageError);
      hasErrors = true;
    }

    if (emailError) {
      showFieldError(emailErrorId, emailError);
      hasErrors = true;
    }

    if (hasErrors) return;

    // Build mailto link (MVP)
    var subject = encodeURIComponent('SG/Send question from ' + (pageValue || window.location.pathname));
    var body    = encodeURIComponent(message.trim());

    if (email && email.trim()) {
      body += encodeURIComponent('\n\n---\nReply to: ' + email.trim());
    }

    body += encodeURIComponent('\n\n---\nSent from: ' + window.location.href);

    var mailtoUrl = 'mailto:' + SHERPA_EMAIL + '?subject=' + subject + '&body=' + body;

    // Open mailto
    window.location.href = mailtoUrl;

    // Show success state
    showAlert(alertId, 'success', 'Opening your email client... If nothing happens, email us directly at ' + SHERPA_EMAIL);
  }

  // ----------------------------------------------------------
  // Bind forms on DOM ready
  // ----------------------------------------------------------

  function init() {
    // Modal form
    var modalForm = document.getElementById('contact-form-modal');
    if (modalForm) {
      modalForm.addEventListener('submit', function (e) {
        var pageInput = modalForm.querySelector('input[name="page"]');
        var pageValue = pageInput ? pageInput.value : window.location.pathname;
        handleSubmit(e, 'modal-message', 'modal-email', 'modal-message-error', 'modal-email-error', 'modal-alert', pageValue);
      });
    }

    // Page form (contact page)
    var pageForm = document.getElementById('contact-form-page');
    if (pageForm) {
      pageForm.addEventListener('submit', function (e) {
        var pageInput = pageForm.querySelector('input[name="page"]');
        var pageValue = pageInput ? pageInput.value : window.location.pathname;
        handleSubmit(e, 'page-message', 'page-email', 'page-message-error', 'page-email-error', 'page-alert', pageValue);
      });
    }

    // File input label update (contact page)
    var fileInput = document.getElementById('page-screenshot');
    if (fileInput) {
      fileInput.addEventListener('change', function () {
        var labelText = document.getElementById('file-label-text');
        if (!labelText) return;
        if (fileInput.files && fileInput.files.length > 0) {
          labelText.textContent = fileInput.files[0].name;
        } else {
          labelText.textContent = 'Choose an image...';
        }
      });
    }
  }

  // Run init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
