import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { authoredMotifs, corpusVersion, ldrawSources } from "./sources.mjs";

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(toolDirectory, "../..");
const outputPath = resolve(
  repositoryRoot,
  "src/lib/brickgpt/data/reference-corpus.generated.json",
);
const duplicateThreshold = 0.92;
const gridExtent = 12;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function round(value, digits = 4) {
  return Number(value.toFixed(digits));
}

function parseSections(text) {
  const sections = [{ name: null, lines: [] }];
  for (const line of text.split(/\r?\n/)) {
    const fileMatch = line.match(/^0 FILE (.+)$/);
    if (fileMatch) {
      sections.push({ name: fileMatch[1].trim(), lines: [] });
    } else {
      sections.at(-1).lines.push(line);
    }
  }
  return sections;
}

function parseReferences(lines) {
  return lines.flatMap((line) => {
    if (!line.startsWith("1 ")) return [];
    const tokens = line.trim().split(/\s+/);
    if (tokens.length < 15) return [];
    const numbers = tokens.slice(2, 14).map(Number);
    if (numbers.some((value) => !Number.isFinite(value))) return [];
    return [{
      translation: numbers.slice(0, 3),
      matrix: [
        numbers.slice(3, 6),
        numbers.slice(6, 9),
        numbers.slice(9, 12),
      ],
      target: tokens.slice(14).join(" "),
    }];
  });
}

function multiplyMatrix(left, right) {
  return left.map((row) =>
    right[0].map((_, column) =>
      row.reduce((sum, value, index) => sum + value * right[index][column], 0),
    ),
  );
}

function applyMatrix(matrix, vector) {
  return matrix.map((row) =>
    row.reduce((sum, value, index) => sum + value * vector[index], 0),
  );
}

function compose(parent, child) {
  const translated = applyMatrix(parent.matrix, child.translation);
  return {
    matrix: multiplyMatrix(parent.matrix, child.matrix),
    translation: parent.translation.map((value, index) => value + translated[index]),
  };
}

function extractPartOrigins(sections) {
  const localSections = new Map(
    sections
      .filter((section) => section.name)
      .map((section) => [section.name.toLowerCase(), section]),
  );
  const points = [];
  const identity = {
    matrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    translation: [0, 0, 0],
  };

  function visit(section, parentTransform, stack) {
    for (const reference of parseReferences(section.lines)) {
      const transform = compose(parentTransform, reference);
      const targetKey = reference.target.toLowerCase();
      const child = localSections.get(targetKey);
      const isPart = /^(parts|p)\//i.test(reference.target);
      const isModel = child?.lines.some((line) => /^0 !LDRAW_ORG Model\b/.test(line));

      if (child && isModel && !isPart) {
        if (stack.has(targetKey)) {
          throw new Error(`Cyclic submodel reference: ${reference.target}`);
        }
        visit(child, transform, new Set([...stack, targetKey]));
      } else {
        points.push(transform.translation);
      }
    }
  }

  visit(sections[0], identity, new Set());
  if (points.length === 0) throw new Error("Model contains no resolvable part placements");
  return points;
}

function normalizePointCloud(points) {
  const oriented = points.map(([x, y, z]) => [x, -y, z]);
  const minimum = [0, 1, 2].map((axis) => Math.min(...oriented.map((point) => point[axis])));
  const maximum = [0, 1, 2].map((axis) => Math.max(...oriented.map((point) => point[axis])));
  const spans = maximum.map((value, axis) => value - minimum[axis]);
  const longestSpan = Math.max(...spans, 1);
  const cells = oriented.map((point) =>
    point.map((value, axis) =>
      Math.round(((value - minimum[axis]) / longestSpan) * (gridExtent - 1)),
    ),
  );
  return {
    cells: uniqueSortedCells(cells),
    dimensionsLdu: {
      width: round(spans[0]),
      height: round(spans[1]),
      depth: round(spans[2]),
    },
  };
}

function uniqueSortedCells(cells) {
  return [...new Set(cells.map((cell) => cell.join(",")))]
    .map((cell) => cell.split(",").map(Number))
    .sort(compareCells);
}

function compareCells(left, right) {
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

function dimensionsFromCells(cells) {
  const maxima = [0, 1, 2].map((axis) => Math.max(...cells.map((cell) => cell[axis])));
  const minima = [0, 1, 2].map((axis) => Math.min(...cells.map((cell) => cell[axis])));
  return maxima.map((value, axis) => value - minima[axis] + 1);
}

function proportions(dimensions) {
  const values = Array.isArray(dimensions)
    ? dimensions
    : [dimensions.width, dimensions.height, dimensions.depth];
  const longest = Math.max(...values, 1);
  return {
    width: round(values[0] / longest),
    height: round(values[1] / longest),
    depth: round(values[2] / longest),
  };
}

function transformedVariants(cells) {
  const transforms = [
    ([x, y, z]) => [x, y, z],
    ([x, y, z]) => [-x, y, z],
    ([x, y, z]) => [x, y, -z],
    ([x, y, z]) => [-x, y, -z],
    ([x, y, z]) => [z, y, x],
    ([x, y, z]) => [-z, y, x],
    ([x, y, z]) => [z, y, -x],
    ([x, y, z]) => [-z, y, -x],
  ];
  return transforms.map((transform) => {
    const transformed = cells.map(transform);
    const minima = [0, 1, 2].map((axis) =>
      Math.min(...transformed.map((cell) => cell[axis])),
    );
    return uniqueSortedCells(
      transformed.map((cell) => cell.map((value, axis) => value - minima[axis])),
    );
  });
}

function serializeCells(cells) {
  return cells.map((cell) => cell.join(",")).join(";");
}

function fingerprints(cells) {
  const variants = transformedVariants(cells).map(serializeCells).sort();
  return {
    occupancySha256: sha256(serializeCells(cells)),
    rotationMirrorInvariantSha256: sha256(variants[0]),
  };
}

function jaccard(left, right) {
  const leftSet = new Set(left.map((cell) => cell.join(",")));
  const rightSet = new Set(right.map((cell) => cell.join(",")));
  let intersection = 0;
  for (const cell of leftSet) if (rightSet.has(cell)) intersection += 1;
  return intersection / (leftSet.size + rightSet.size - intersection);
}

function bestShapeSimilarity(left, right) {
  let best = 0;
  for (const variant of transformedVariants(right)) {
    best = Math.max(best, jaccard(left, variant));
  }
  return round(best);
}

async function compileLdrawSource(source) {
  const absolutePath = resolve(repositoryRoot, source.path);
  const text = await readFile(absolutePath, "utf8");
  const sections = parseSections(text);
  const rootLines = sections[0];
  const nameLine = `0 Name: ${source.modelName}`;
  const authorLine = `0 Author: ${source.author}`;

  for (const expected of [nameLine, authorLine, source.licenseEvidence]) {
    if (!rootLines.lines.includes(expected)) {
      throw new Error(`${source.path} is missing expected metadata: ${expected}`);
    }
  }

  const pointCloud = extractPartOrigins(sections);
  const normalized = normalizePointCloud(pointCloud);
  return {
    id: source.id,
    kind: "licensed-reference",
    title: source.title,
    semantic: {
      tags: [...source.tags].sort(),
      features: [...source.features].sort(),
      proportions: proportions(normalized.dimensionsLdu),
    },
    occupancy: {
      gridConvention: "integer cells; x=width, y=height, z=depth; longest source span maps to 12 cells",
      cells: normalized.cells,
      cellCount: normalized.cells.length,
      sourcePartPlacementCount: pointCloud.length,
    },
    provenance: {
      sourceCollection: source.sourceCollection,
      sourcePath: source.path,
      sourceUrl: source.sourceUrl,
      modelName: source.modelName,
      author: source.author,
      sourceSha256: sha256(text),
      derivation: "Color-independent 12-cell occupancy sampled from recursively resolved LDraw part origins",
    },
    license: {
      id: source.license,
      declaration: source.licenseEvidence.replace(/^0 !LICENSE /, ""),
      attributionRequired: true,
      url: "https://www.ldraw.org/article/227.html",
    },
    fingerprints: fingerprints(normalized.cells),
  };
}

function compileAuthoredMotif(motif) {
  const cells = uniqueSortedCells(motif.cells);
  const dimensions = dimensionsFromCells(cells);
  return {
    id: motif.id,
    kind: "authored-motif",
    title: motif.title,
    semantic: {
      tags: [...motif.tags].sort(),
      features: [...motif.features].sort(),
      proportions: proportions(dimensions),
    },
    occupancy: {
      gridConvention: "integer motif cells; x=width, y=height, z=depth",
      cells,
      cellCount: cells.length,
      dimensions: {
        width: dimensions[0],
        height: dimensions[1],
        depth: dimensions[2],
      },
    },
    provenance: {
      sourceCollection: "YelloBricks independently authored generic motifs",
      sourcePath: "tools/brick-corpus/sources.mjs",
      author: "YelloBricks contributors",
      derivation: "Original abstract motif authored as generic occupied cells; not traced from a third-party model",
    },
    license: {
      id: "CC0-1.0",
      declaration: "Dedicated to the public domain under CC0 1.0",
      attributionRequired: false,
      url: "https://creativecommons.org/publicdomain/zero/1.0/",
    },
    fingerprints: fingerprints(cells),
  };
}

function addDuplicateChecks(entries) {
  const nearest = new Map(entries.map((entry) => [entry.id, { id: null, similarity: 0 }]));
  let pairsChecked = 0;
  let maximumSimilarity = 0;

  for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
      pairsChecked += 1;
      const left = entries[leftIndex];
      const right = entries[rightIndex];
      const similarity = bestShapeSimilarity(left.occupancy.cells, right.occupancy.cells);
      maximumSimilarity = Math.max(maximumSimilarity, similarity);
      if (similarity > nearest.get(left.id).similarity) {
        nearest.set(left.id, { id: right.id, similarity });
      }
      if (similarity > nearest.get(right.id).similarity) {
        nearest.set(right.id, { id: left.id, similarity });
      }
      if (similarity >= duplicateThreshold) {
        throw new Error(
          `Near-duplicate occupancy: ${left.id} and ${right.id} (${similarity})`,
        );
      }
    }
  }

  for (const entry of entries) {
    entry.nearDuplicateCheck = {
      method: "maximum Jaccard similarity across horizontal rotations and mirrors",
      rejectionThreshold: duplicateThreshold,
      nearestEntryId: nearest.get(entry.id).id,
      nearestSimilarity: nearest.get(entry.id).similarity,
      passed: true,
    };
  }
  return { pairsChecked, maximumSimilarity: round(maximumSimilarity) };
}

async function main() {
  const licensed = [];
  for (const source of ldrawSources) licensed.push(await compileLdrawSource(source));
  const motifs = authoredMotifs.map(compileAuthoredMotif);
  const entries = [...licensed, ...motifs].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const duplicateChecks = addDuplicateChecks(entries);
  const corpus = {
    schemaVersion: 1,
    corpusVersion,
    generatedBy: "tools/brick-corpus/compile.mjs",
    generation: {
      deterministic: true,
      networkAccessRequired: false,
      occupancyGridExtent: gridExtent,
    },
    rightsPolicy: {
      acceptedLicenses: ["CCAL-2.0", "CC0-1.0"],
      excludedSources: [
        "public/ldraw/samples/car.ldr_Packed.mpd (no model-level license declaration)",
      ],
      prohibitedInputs: ["Rebrickable MOCs", "StableText2Brick", "unlicensed MOCs"],
    },
    checks: {
      metadataValidatedFromSourceHeaders: true,
      sourceHashesRecorded: true,
      nearDuplicates: {
        ...duplicateChecks,
        rejectionThreshold: duplicateThreshold,
        passed: true,
      },
    },
    entries,
  };
  const serialized = `${JSON.stringify(corpus, null, 2)}\n`;

  if (process.argv.includes("--check")) {
    const existing = await readFile(outputPath, "utf8");
    if (existing !== serialized) {
      throw new Error("Generated corpus is stale; run node tools/brick-corpus/compile.mjs");
    }
    console.log(`Verified ${entries.length} corpus entries at ${outputPath}`);
    return;
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized);
  console.log(`Wrote ${entries.length} corpus entries to ${outputPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
