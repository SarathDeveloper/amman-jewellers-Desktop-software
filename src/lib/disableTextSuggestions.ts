/** Kill native spellcheck / autocorrect bubbles on every text field. */

function apply(el: HTMLInputElement | HTMLTextAreaElement | HTMLElement) {
  el.spellcheck = false
  el.setAttribute('autocorrect', 'off')
  el.setAttribute('autocapitalize', 'off')
}

function onFocusIn(event: FocusEvent) {
  const target = event.target
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    apply(target)
    return
  }
  if (target instanceof HTMLElement && target.isContentEditable) {
    apply(target)
  }
}

export function disableTextSuggestions() {
  document.documentElement.spellcheck = false
  document.body.spellcheck = false
  document.addEventListener('focusin', onFocusIn, true)
}
