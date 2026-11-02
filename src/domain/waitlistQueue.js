class Node {
  constructor(value) {
    this.value = value;
    this.next = null;
  }
}

export class Queue {
  #head = null;
  #tail = null;
  #size = 0;

  get size() {
    return this.#size;
  }

  enqueue(value) {
    const node = new Node(value);

    if (this.#tail === null) {
      this.#head = node;
    } else {
      this.#tail.next = node;
    }

    this.#tail = node;
    this.#size += 1;
    return this.#size;
  }

  dequeue() {
    if (this.#head === null) {
      return undefined;
    }

    const value = this.#head.value;
    this.#head = this.#head.next;
    this.#size -= 1;

    if (this.#head === null) {
      this.#tail = null;
    }

    return value;
  }

  peek() {
    return this.#head === null ? undefined : this.#head.value;
  }
}
