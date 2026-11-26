import { count } from 'drizzle-orm';
import { db } from './index.ts';
import {
  categories,
  productCustomizations,
  products,
  restaurantSettings,
} from './schema.ts';

const IMG_HERO = '/src/assets/images/hero_cafe_signature_1795554215820.jpg';
const IMG_HOT = '/src/assets/images/drink_hot_espresso_1795554216923.jpg';
const IMG_ICED = '/src/assets/images/drink_iced_coffee_1795554216864.jpg';
const IMG_MATCHA_FRAPPE = '/src/assets/images/drink_matcha_frappe_1795554217909.jpg';
const IMG_SODA_SMOOTHIE = '/src/assets/images/drink_smoothie_soda_1795554217898.jpg';
const IMG_BAKERY = '/src/assets/images/bakery_desserts_pastry_1795554218238.jpg';

let seedPromise: Promise<void> | null = null;

export async function ensureSeeded(): Promise<void> {
  if (seedPromise) return seedPromise;

  seedPromise = (async () => {
    try {
      const settingsCount = await db.select({ value: count() }).from(restaurantSettings);
      if (Number(settingsCount[0]?.value ?? 0) === 0) {
        await db.insert(restaurantSettings).values({
          name: '360 Café',
          logoUrl: '/360-logo.png',
          tagline: 'Upgrade your mood.',
          description:
            '360 Café is your neighborhood specialty coffee house and pastry bar — crafted in Egypt with single-origin espresso, ceremonial Uji matcha, signature iced lattes, and fresh French-style viennoiserie.',
          phone: '+20 100 360 0360',
          email: 'hello@360-cafe.com',
          address: 'El Hay El Tarfihy, El Obour City, Cairo Governorate, Egypt',
          lat: 30.2283,
          lng: 31.4796,
          openingHours: 'Daily: 8:00 AM – 2:00 AM',
          deliveryFeeEgp: 35,
          minOrderEgp: 100,
          instagramUrl: 'https://www.instagram.com/360cafe.eg/',
          facebookUrl: 'https://www.facebook.com/360cafe.eg/',
          tiktokUrl: 'https://www.tiktok.com/@360cafe.eg',
        });
      }

      const categoryCount = await db.select({ value: count() }).from(categories);
      if (Number(categoryCount[0]?.value ?? 0) === 0) {
        const seedCategories = [
          {
            name: 'Classics',
            slug: 'classics',
            description: 'Timeless espresso pulls, velvety microfoam, and balanced roasts.',
            imageUrl: IMG_HOT,
            sortOrder: 1,
          },
          {
            name: 'Specialty Coffee',
            slug: 'specialty-coffee',
            description: 'Precision hand-brewed pour overs and slow-steeped single origins.',
            imageUrl: IMG_HOT,
            sortOrder: 2,
          },
          {
            name: 'Signature Drinks',
            slug: 'signature-drinks',
            description: '360 Café house originals infused with toasted caramel, lavender, and crème brûlée.',
            imageUrl: IMG_HERO,
            sortOrder: 3,
          },
          {
            name: 'Iced Coffee',
            slug: 'iced-coffee',
            description: 'Chilled espresso layered over crystal ice and silky cold milk.',
            imageUrl: IMG_ICED,
            sortOrder: 4,
          },
          {
            name: 'Non-Coffee',
            slug: 'non-coffee',
            description: 'Belgian hot chocolate, spiced chai, and loose-leaf reserve teas.',
            imageUrl: IMG_HOT,
            sortOrder: 5,
          },
          {
            name: 'Frappé',
            slug: 'frappe',
            description: 'Velvety ice-blended coffee and cocoa indulgences topped with cream.',
            imageUrl: IMG_MATCHA_FRAPPE,
            sortOrder: 6,
          },
          {
            name: 'Cocktail Soda',
            slug: 'cocktail-soda',
            description: 'Sparkling botanical spritzers crafted with real fruit purée and fresh herbs.',
            imageUrl: IMG_SODA_SMOOTHIE,
            sortOrder: 7,
          },
          {
            name: 'Smoothies',
            slug: 'smoothies',
            description: 'Thick, sun-ripened fruit blends whipped cold to order.',
            imageUrl: IMG_SODA_SMOOTHIE,
            sortOrder: 8,
          },
          {
            name: 'Matcha',
            slug: 'matcha',
            description: 'First-harvest ceremonial Japanese matcha whisked smooth.',
            imageUrl: IMG_MATCHA_FRAPPE,
            sortOrder: 9,
          },
          {
            name: 'Fresh Juices',
            slug: 'fresh-juices',
            description: 'Cold-pressed seasonal fruits squeezed fresh every morning.',
            imageUrl: IMG_SODA_SMOOTHIE,
            sortOrder: 10,
          },
          {
            name: 'Soft Drinks',
            slug: 'soft-drinks',
            description: 'Chilled sparkling mineral waters and craft sodas.',
            imageUrl: IMG_SODA_SMOOTHIE,
            sortOrder: 11,
          },
          {
            name: 'Bakery & Sandwiches',
            slug: 'bakery-sandwiches',
            description: 'Flaky all-butter croissants and warm savory melts.',
            imageUrl: IMG_BAKERY,
            sortOrder: 12,
          },
          {
            name: 'Desserts & Pastry',
            slug: 'desserts-pastry',
            description: 'Signature Lotus cheesecake cups, chocolate fudge tarts, and artisan sweets.',
            imageUrl: IMG_BAKERY,
            sortOrder: 13,
          },
        ];

        const insertedCats = await db
          .insert(categories)
          .values(seedCategories)
          .returning();

        const catBySlug: Record<string, number> = {};
        for (const c of insertedCats) {
          catBySlug[c.slug] = c.id;
        }

        type SeedProduct = {
          categorySlug: string;
          name: string;
          description: string;
          priceEgp: number;
          promoPriceEgp?: number | null;
          imageUrl: string;
          isFeatured?: boolean;
          sortOrder: number;
          hasCoffeeMods?: boolean;
          hasPastryMods?: boolean;
        };

        const seedProducts: SeedProduct[] = [
          // Classics
          {
            categorySlug: 'classics',
            name: 'Double Espresso',
            description: 'Rich double shot of our signature house medium-dark roast with velvety tiger crema.',
            priceEgp: 65,
            imageUrl: IMG_HOT,
            sortOrder: 1,
            hasCoffeeMods: true,
          },
          {
            categorySlug: 'classics',
            name: 'Cappuccino',
            description: 'Balanced double espresso crowned with silky steamed milk and dense microfoam.',
            priceEgp: 95,
            imageUrl: IMG_HOT,
            sortOrder: 2,
            hasCoffeeMods: true,
          },
          {
            categorySlug: 'classics',
            name: 'Café Latte',
            description: 'Smooth espresso folded into gently steamed milk with a whisper of foam.',
            priceEgp: 95,
            imageUrl: IMG_HOT,
            sortOrder: 3,
            hasCoffeeMods: true,
          },
          {
            categorySlug: 'classics',
            name: 'Cortado',
            description: 'Equal parts bold double ristretto and warm silky textured milk.',
            priceEgp: 80,
            imageUrl: IMG_HOT,
            sortOrder: 4,
            hasCoffeeMods: true,
          },
          // Specialty Coffee
          {
            categorySlug: 'specialty-coffee',
            name: 'V60 Single Origin Pour Over',
            description: 'Hand-poured washed Ethiopian roast highlighting jasmine, bergamot, and honey notes.',
            priceEgp: 115,
            imageUrl: IMG_HOT,
            sortOrder: 1,
          },
          {
            categorySlug: 'specialty-coffee',
            name: 'Cold Brew Reserve',
            description: '18-hour cold-steeped single origin concentrate served crisp over clear ice.',
            priceEgp: 110,
            imageUrl: IMG_ICED,
            sortOrder: 2,
          },
          // Signature Drinks
          {
            categorySlug: 'signature-drinks',
            name: '360° Lavender Latte',
            description: 'Our iconic house creation: smooth espresso, velvety milk, and floral French lavender syrup.',
            priceEgp: 135,
            promoPriceEgp: 115,
            imageUrl: IMG_HERO,
            isFeatured: true,
            sortOrder: 1,
            hasCoffeeMods: true,
          },
          {
            categorySlug: 'signature-drinks',
            name: 'Crème Brûlée Latte',
            description: 'Torched caramelized vanilla custard notes swirled with double espresso and steamed milk.',
            priceEgp: 130,
            imageUrl: IMG_HOT,
            isFeatured: true,
            sortOrder: 2,
            hasCoffeeMods: true,
          },
          {
            categorySlug: 'signature-drinks',
            name: 'Caramel Macchiato',
            description: 'Layered vanilla-infused milk marked with rich espresso and buttery caramel drizzle.',
            priceEgp: 120,
            imageUrl: IMG_ICED,
            sortOrder: 3,
            hasCoffeeMods: true,
          },
          {
            categorySlug: 'signature-drinks',
            name: 'Nutella Hazelnut Mocha',
            description: 'Indulgent roasted hazelnut chocolate melted into fresh espresso and steamed milk.',
            priceEgp: 125,
            imageUrl: IMG_HOT,
            sortOrder: 4,
            hasCoffeeMods: true,
          },
          // Iced Coffee
          {
            categorySlug: 'iced-coffee',
            name: 'Iced Spanish Latte',
            description: 'Chilled milk sweetened with condensed milk cream and poured over bold espresso and ice.',
            priceEgp: 125,
            promoPriceEgp: 105,
            imageUrl: IMG_ICED,
            isFeatured: true,
            sortOrder: 1,
            hasCoffeeMods: true,
          },
          {
            categorySlug: 'iced-coffee',
            name: 'Iced Salted Caramel Latte',
            description: 'Crystal ice, cold milk, sea-salt caramel ribbon, and rich double espresso.',
            priceEgp: 120,
            imageUrl: IMG_ICED,
            sortOrder: 2,
            hasCoffeeMods: true,
          },
          {
            categorySlug: 'iced-coffee',
            name: 'Iced White Mocha',
            description: 'Creamy Belgian white chocolate blended with chilled espresso over ice.',
            priceEgp: 125,
            imageUrl: IMG_ICED,
            sortOrder: 3,
            hasCoffeeMods: true,
          },
          // Non-Coffee
          {
            categorySlug: 'non-coffee',
            name: 'Belgian Hot Chocolate',
            description: '70% dark Belgian cocoa melted into steamed milk with delicate cocoa dusting.',
            priceEgp: 105,
            imageUrl: IMG_HOT,
            sortOrder: 1,
          },
          {
            categorySlug: 'non-coffee',
            name: 'Spiced Masala Chai Latte',
            description: 'Aromatic black tea steeped with cardamom, cinnamon, and steamed frothy milk.',
            priceEgp: 95,
            imageUrl: IMG_HOT,
            sortOrder: 2,
          },
          // Frappé
          {
            categorySlug: 'frappe',
            name: 'Mocha Crunch Frappé',
            description: 'Ice-blended dark chocolate and espresso crowned with whipped cream and cocoa nibs.',
            priceEgp: 130,
            imageUrl: IMG_MATCHA_FRAPPE,
            isFeatured: true,
            sortOrder: 1,
            hasCoffeeMods: true,
          },
          {
            categorySlug: 'frappe',
            name: 'Salted Caramel Frappé',
            description: 'Velvety blended caramel coffee topped with whipped cream and golden caramel drizzle.',
            priceEgp: 125,
            imageUrl: IMG_MATCHA_FRAPPE,
            sortOrder: 2,
            hasCoffeeMods: true,
          },
          // Cocktail Soda
          {
            categorySlug: 'cocktail-soda',
            name: 'Berry Hibiscus Fizz',
            description: 'Sparkling soda infused with brewed Egyptian hibiscus, crushed berries, and fresh mint.',
            priceEgp: 95,
            imageUrl: IMG_SODA_SMOOTHIE,
            isFeatured: true,
            sortOrder: 1,
          },
          {
            categorySlug: 'cocktail-soda',
            name: 'Passion Fruit Mojito Soda',
            description: 'Tangy tropical passion fruit muddled with lime, garden mint, and crisp soda.',
            priceEgp: 95,
            imageUrl: IMG_SODA_SMOOTHIE,
            sortOrder: 2,
          },
          // Smoothies
          {
            categorySlug: 'smoothies',
            name: 'Peach Mango Smoothie',
            description: 'Sun-ripened Egyptian mango and sweet white peach blended into a silky fruit chill.',
            priceEgp: 110,
            imageUrl: IMG_SODA_SMOOTHIE,
            sortOrder: 1,
          },
          {
            categorySlug: 'smoothies',
            name: 'Wild Berry Yogurt Smoothie',
            description: 'Blackberries, raspberries, and creamy Greek yogurt whipped ice-cold.',
            priceEgp: 115,
            imageUrl: IMG_SODA_SMOOTHIE,
            sortOrder: 2,
          },
          // Matcha
          {
            categorySlug: 'matcha',
            name: 'Iced Ceremonial Matcha Latte',
            description: 'First-harvest ceremonial Uji matcha whisked to order over cold milk and ice.',
            priceEgp: 140,
            promoPriceEgp: 120,
            imageUrl: IMG_MATCHA_FRAPPE,
            isFeatured: true,
            sortOrder: 1,
            hasCoffeeMods: true,
          },
          {
            categorySlug: 'matcha',
            name: 'Strawberry Cloud Matcha',
            description: 'House strawberry compote layered with cold milk and vibrant whisked matcha.',
            priceEgp: 150,
            imageUrl: IMG_MATCHA_FRAPPE,
            sortOrder: 2,
            hasCoffeeMods: true,
          },
          // Fresh Juices
          {
            categorySlug: 'fresh-juices',
            name: 'Fresh Valencia Orange Juice',
            description: '100% pure cold-pressed Egyptian oranges with zero added sugar.',
            priceEgp: 75,
            imageUrl: IMG_SODA_SMOOTHIE,
            sortOrder: 1,
          },
          {
            categorySlug: 'fresh-juices',
            name: 'Lemon Mint Crush',
            description: 'Zesty fresh-squeezed lime blended with cool garden mint leaves and ice.',
            priceEgp: 70,
            imageUrl: IMG_SODA_SMOOTHIE,
            sortOrder: 2,
          },
          // Soft Drinks
          {
            categorySlug: 'soft-drinks',
            name: 'Sparkling Mineral Water',
            description: 'Chilled carbonated natural spring water served with a slice of lime.',
            priceEgp: 45,
            imageUrl: IMG_SODA_SMOOTHIE,
            sortOrder: 1,
          },
          {
            categorySlug: 'soft-drinks',
            name: 'Craft Cola',
            description: 'Ice-cold classic cola served in a chilled glass.',
            priceEgp: 50,
            imageUrl: IMG_SODA_SMOOTHIE,
            sortOrder: 2,
          },
          // Bakery & Sandwiches
          {
            categorySlug: 'bakery-sandwiches',
            name: 'French Butter Croissant',
            description: '27-layer laminated pastry baked golden every morning with cultured Normandy butter.',
            priceEgp: 75,
            imageUrl: IMG_BAKERY,
            sortOrder: 1,
            hasPastryMods: true,
          },
          {
            categorySlug: 'bakery-sandwiches',
            name: 'Smoked Turkey & Emmental Croissant',
            description: 'Warm flaky croissant layered with smoked turkey breast, melted Emmental, and honey mustard.',
            priceEgp: 145,
            imageUrl: IMG_BAKERY,
            isFeatured: true,
            sortOrder: 2,
            hasPastryMods: true,
          },
          {
            categorySlug: 'bakery-sandwiches',
            name: 'Croissant Egg & Cheddar Melt',
            description: 'Fluffy folded eggs, aged cheddar, and chive butter inside a toasted croissant.',
            priceEgp: 130,
            imageUrl: IMG_BAKERY,
            sortOrder: 3,
            hasPastryMods: true,
          },
          // Desserts & Pastry
          {
            categorySlug: 'desserts-pastry',
            name: 'Lotus Biscoff Cheesecake Cup',
            description: 'Velvety mascarpone cheesecake layered with spiced Lotus Biscoff spread and biscuit crumble.',
            priceEgp: 135,
            imageUrl: IMG_BAKERY,
            isFeatured: true,
            sortOrder: 1,
            hasPastryMods: true,
          },
          {
            categorySlug: 'desserts-pastry',
            name: 'Dark Chocolate Fudge Tart',
            description: 'Crisp cocoa sablé shell filled with glossy 70% dark chocolate ganache and flaky sea salt.',
            priceEgp: 125,
            imageUrl: IMG_BAKERY,
            sortOrder: 2,
            hasPastryMods: true,
          },
          {
            categorySlug: 'desserts-pastry',
            name: 'Classic Honey Cake',
            description: 'Delicate caramelized honey sponge layers with whipped sour-cream frosting.',
            priceEgp: 120,
            imageUrl: IMG_BAKERY,
            sortOrder: 3,
          },
        ];

        for (const p of seedProducts) {
          const categoryId = catBySlug[p.categorySlug];
          if (!categoryId) continue;

          const [insertedProd] = await db
            .insert(products)
            .values({
              categoryId,
              name: p.name,
              description: p.description,
              priceEgp: p.priceEgp,
              promoPriceEgp: p.promoPriceEgp ?? null,
              imageUrl: p.imageUrl,
              isAvailable: true,
              isFeatured: Boolean(p.isFeatured),
              sortOrder: p.sortOrder,
            })
            .returning();

          if (p.hasCoffeeMods) {
            await db.insert(productCustomizations).values([
              {
                productId: insertedProd.id,
                groupName: 'Size',
                optionName: 'Regular',
                priceDeltaEgp: 0,
                isRequired: true,
                isMultiSelect: false,
                sortOrder: 1,
              },
              {
                productId: insertedProd.id,
                groupName: 'Size',
                optionName: 'Large',
                priceDeltaEgp: 20,
                isRequired: true,
                isMultiSelect: false,
                sortOrder: 2,
              },
              {
                productId: insertedProd.id,
                groupName: 'Milk Choice',
                optionName: 'Fresh Whole Milk',
                priceDeltaEgp: 0,
                isRequired: false,
                isMultiSelect: false,
                sortOrder: 3,
              },
              {
                productId: insertedProd.id,
                groupName: 'Milk Choice',
                optionName: 'Oat Milk',
                priceDeltaEgp: 25,
                isRequired: false,
                isMultiSelect: false,
                sortOrder: 4,
              },
              {
                productId: insertedProd.id,
                groupName: 'Milk Choice',
                optionName: 'Almond Milk',
                priceDeltaEgp: 25,
                isRequired: false,
                isMultiSelect: false,
                sortOrder: 5,
              },
              {
                productId: insertedProd.id,
                groupName: 'Add-Ons',
                optionName: 'Extra Espresso Shot',
                priceDeltaEgp: 25,
                isRequired: false,
                isMultiSelect: true,
                sortOrder: 6,
              },
              {
                productId: insertedProd.id,
                groupName: 'Add-Ons',
                optionName: 'Caramel Drizzle',
                priceDeltaEgp: 15,
                isRequired: false,
                isMultiSelect: true,
                sortOrder: 7,
              },
            ]);
          } else if (p.hasPastryMods) {
            await db.insert(productCustomizations).values([
              {
                productId: insertedProd.id,
                groupName: 'Preparation',
                optionName: 'Warmed in Oven',
                priceDeltaEgp: 0,
                isRequired: false,
                isMultiSelect: false,
                sortOrder: 1,
              },
              {
                productId: insertedProd.id,
                groupName: 'Add-Ons',
                optionName: 'Extra Nutella Dip',
                priceDeltaEgp: 25,
                isRequired: false,
                isMultiSelect: true,
                sortOrder: 2,
              },
            ]);
          }
        }
      }
    } catch (error) {
      seedPromise = null;
      console.error('Database seed failed:', error);
      throw new Error('Failed to initialize menu catalog.', { cause: error });
    }
  })();

  return seedPromise;
}
