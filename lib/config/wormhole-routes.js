export const WORMHOLE_ROUTE_CANDIDATES = [
  {
    name: 'Ethereum → Solana',
    type: 'token-bridge',
    chainFrom: 'ethereum',
    chainTo: 'solana',
    identifiers: {
      chainFromIds: [2, '2', 'ethereum'],
      chainToIds: [1, '1', 'solana'],
    },
  },
  {
    name: 'Solana → Ethereum',
    type: 'token-bridge',
    chainFrom: 'solana',
    chainTo: 'ethereum',
    identifiers: {
      chainFromIds: [1, '1', 'solana'],
      chainToIds: [2, '2', 'ethereum'],
    },
  },
  {
    name: 'Arbitrum → Solana',
    type: 'token-bridge',
    chainFrom: 'arbitrum',
    chainTo: 'solana',
    identifiers: {
      chainFromIds: [23, '23', 'arbitrum'],
      chainToIds: [1, '1', 'solana'],
    },
  },
  {
    name: 'Base → Solana',
    type: 'token-bridge',
    chainFrom: 'base',
    chainTo: 'solana',
    identifiers: {
      chainFromIds: [30, '30', 'base'],
      chainToIds: [1, '1', 'solana'],
    },
  },
  {
    name: 'Polygon → Solana',
    type: 'token-bridge',
    chainFrom: 'polygon',
    chainTo: 'solana',
    identifiers: {
      chainFromIds: [5, '5', 'polygon'],
      chainToIds: [1, '1', 'solana'],
    },
  },
];
