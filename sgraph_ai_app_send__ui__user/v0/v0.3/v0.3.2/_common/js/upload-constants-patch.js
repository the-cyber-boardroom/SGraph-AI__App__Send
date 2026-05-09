/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Upload Constants Patch (v0.3.2)

   Reduces the wizard from 6 steps to 5 by merging the Delivery and Share mode
   steps into a single "Options" step.

   Load AFTER upload-constants.js.
   ═══════════════════════════════════════════════════════════════════════════════ */

// Five-step wizard (was six in v0.3.0)
UploadConstants.STEP_LABELS = ['Upload', 'Options', 'Confirm', 'Encrypt & Upload', 'Done'];
UploadConstants.TOTAL_STEPS = 5;

// New state map: 'choosing-options' replaces both 'choosing-delivery' and 'choosing-share'
UploadConstants.STATE_TO_STEP = {
    'idle': 1, 'folder-options': 1, 'file-ready': 1,
    'choosing-options': 2,
    'confirming':       3,
    'zipping': 4, 'reading': 4, 'encrypting': 4,
    'creating': 4, 'uploading': 4, 'completing': 4,
    'complete': 5,
    'error': 1
};

// Propagate new labels to SendStepIndicator (copied by orchestrator connectedCallback)
if (typeof SendStepIndicator !== 'undefined') {
    SendStepIndicator.STEP_LABELS = UploadConstants.STEP_LABELS;
}

// stepForState() in v0.3.0 is closed over a private STATE_TO_STEP variable, so
// reassigning the public property alone has no effect. Override the function so
// it reads from the public (patched) property — required for the stepper to
// advance to step 2 when state becomes 'choosing-options'.
UploadConstants.stepForState = function(state) {
    return UploadConstants.STATE_TO_STEP[state] || 1;
};
