import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BrickGptGoldenGallery } from '@/components/BrickGptGoldenGallery';
import { createFallbackBuildBrief } from '@/lib/brickgpt/brief';
import {
  GOLDEN_BUILD_INVENTORY,
  GOLDEN_BUILD_PROMPTS,
} from '@/lib/brickgpt/golden';
import { planBuildFromInventory } from '@/lib/planner';

export const dynamic = 'force-dynamic';

export default async function BrickGptGalleryPage() {
  if (process.env.NODE_ENV !== 'development') notFound();

  const plans = [];
  for (const [index, [category, prompt]] of GOLDEN_BUILD_PROMPTS.entries()) {
    const brief = {
      ...createFallbackBuildBrief(prompt),
      category,
      partBudget: { min: 10, max: 32 },
      seed: 0x5eed0000 + index,
    };
    plans.push(await planBuildFromInventory(
      GOLDEN_BUILD_INVENTORY,
      prompt,
      0.72,
      14,
      brief,
    ));
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 text-gray-900 md:p-10">
      <div className="mx-auto max-w-7xl">
        <Link href="/" className="text-sm text-blue-700 hover:underline">
          ← Garage
        </Link>
        <h1 className="mt-3 text-3xl font-black">BrickGPT golden gallery</h1>
        <p className="mb-6 mt-2 text-sm text-gray-600">
          Development-only fixed-seed builds generated from the synthetic quality inventory.
        </p>
        <BrickGptGoldenGallery plans={plans} />
      </div>
    </main>
  );
}
