import { cards } from '../src/db/schema/cards.js';
import { db } from '../src/db/index.js';

if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing to run db:seed in production.');
}

const now = new Date();

const seedCards = [
  {
    tcgplayerId: 8927752,
    tcgProductId: 653083,
    productLine: 'Riftbound: League of Legends Trading Card Game',
    setName: 'Origins',
    productName: "Targon's Peak",
    number: '289/298',
    rarity: 'Uncommon',
    condition: 'Near Mint',
    quantity: 2,
    status: 'matched' as const,
    marketPrice: '0.20',
    listingPrice: '0.20',
    isFoilPrice: false,
    photoUrl:
      'https://tcgplayer-cdn.tcgplayer.com/product/653083_in_400x400.jpg',
    notes: null,
    updatedAt: now,
  },
  {
    tcgplayerId: 8926802,
    tcgProductId: 652954,
    productLine: 'Riftbound: League of Legends Trading Card Game',
    setName: 'Origins',
    productName: 'Chaos Rune',
    number: '166/298',
    rarity: 'Common',
    condition: 'Near Mint',
    quantity: 4,
    status: 'listed' as const,
    marketPrice: '0.20',
    listingPrice: '0.20',
    isFoilPrice: false,
    photoUrl:
      'https://tcgplayer-cdn.tcgplayer.com/product/652954_in_400x400.jpg',
    notes: null,
    updatedAt: now,
  },
  {
    tcgplayerId: 8925462,
    tcgProductId: 652777,
    productLine: 'Riftbound: League of Legends Trading Card Game',
    setName: 'Origins',
    productName: 'Fury Rune',
    number: '007/298',
    rarity: 'Common',
    condition: 'Near Mint',
    quantity: 6,
    status: 'gift' as const,
    marketPrice: '0.04',
    listingPrice: '0.04',
    isFoilPrice: false,
    photoUrl:
      'https://tcgplayer-cdn.tcgplayer.com/product/652777_in_400x400.jpg',
    notes: 'Below minimum listing threshold',
    updatedAt: now,
  },
  {
    tcgplayerId: null,
    tcgProductId: null,
    productLine: 'Riftbound: League of Legends Trading Card Game',
    setName: 'Origins',
    productName: 'Mystery Prototype Card',
    number: '999/298',
    rarity: 'Rare',
    condition: 'Near Mint',
    quantity: 1,
    status: 'needs_attention' as const,
    marketPrice: null,
    listingPrice: null,
    isFoilPrice: false,
    photoUrl: null,
    notes: 'No market price available',
    updatedAt: now,
  },
  {
    tcgplayerId: 8925412,
    tcgProductId: 652772,
    productLine: 'Riftbound: League of Legends Trading Card Game',
    setName: 'Origins',
    productName: 'Brazen Buccaneer',
    number: '002/298',
    rarity: 'Common',
    condition: 'Near Mint',
    quantity: 3,
    status: 'matched' as const,
    marketPrice: '0.24',
    listingPrice: '0.24',
    isFoilPrice: true,
    photoUrl:
      'https://tcgplayer-cdn.tcgplayer.com/product/652772_in_400x400.jpg',
    notes: 'Price from Foil (no Normal pricing available)',
    updatedAt: now,
  },
];

async function seed() {
  console.log('🧹 Clearing cards table...');
  await db.delete(cards);

  console.log(`🌱 Inserting ${seedCards.length} sample cards...`);
  await db.insert(cards).values(seedCards);

  console.log('✅ Seed complete');
}

seed()
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
