export function el(tag, props = {}, children = []) {
  const element = document.createElement(tag);

  for (const [name, value] of Object.entries(props)) {
    if (name.startsWith('on') && typeof value === 'function') {
      element.addEventListener(name.slice(2).toLowerCase(), value);
    } else if (name === 'className') {
      element.className = value;
    } else if (name in element && !name.startsWith('aria-') && !name.startsWith('data-')) {
      element[name] = value;
    } else if (value !== false && value !== null && value !== undefined) {
      element.setAttribute(name, value === true ? '' : String(value));
    }
  }

  const items = Array.isArray(children) ? children : [children];
  for (const child of items.flat(Infinity)) {
    if (child === null || child === undefined || child === false) {
      continue;
    }
    if (child instanceof Node) {
      element.append(child);
    } else {
      const text = document.createTextNode('');
      text.textContent = String(child);
      element.append(text);
    }
  }

  return element;
}

export function formatPrice(cents) {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new TypeError('Price must be a non-negative whole number of cents.');
  }
  const amount = (cents / 100).toLocaleString('en-NG', {
    maximumFractionDigits: 2,
  });
  return `₦${amount}`;
}

export function formatEventDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Date to be announced';
  }
  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'medium',
    timeStyle: value.length > 10 ? 'short' : undefined,
  }).format(date);
}
