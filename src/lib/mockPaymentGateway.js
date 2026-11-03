export function createMockPaymentGateway() {
  return {
    async charge({ decline = false } = {}) {
      return decline ? { status: 'declined' } : { status: 'success' };
    },
  };
}
