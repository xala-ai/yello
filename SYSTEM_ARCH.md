# BrickMixer System Architecture

## Overview
BrickMixer is a Next.js 15+ (React 19) application that helps Lego enthusiasts find alternative builds (MOCs) using their existing Lego sets. It uses the Rebrickable API for data but adds significant "Smart" logic on top to enable multi-set mixing, semantic search, and buildability analysis.

## Tech Stack
- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **State Management:** Zustand (Persistent Local Storage + Hydration)
- **API Handling:** Server Actions (Proxying Rebrickable API)

## Core Modules

### 1. Garage Store (`src/store/garage.ts`)
The central brain of the client-side app.
- **State:**
  - `sets`: List of user-owned sets.
  - `selectedSetIds`: ID list of sets currently active for mixing.
  - `setInventories`: Cache of part lists (SetNum -> InventoryPart[]).
  - `smartMatches`: Results of the mixing engine.
- **Key Actions:**
  - `findSmartBuilds(query?)`: The main orchestration function that triggers the candidate search and matching logic.

### 2. Smart Mix Engine (`src/store/garage.ts` + `src/app/actions.ts`)
How we find what you can build:
1.  **Aggregation:** Sums up all parts from `selectedSetIds` into a `MasterBin`.
2.  **Candidate Discovery (Server-Side):**
    - **Strategy A (Theme):** Finds popular MOCs in the same themes as your sets.
    - **Strategy B (Combination):** Finds MOCs tagged "Combination" (if multiple sets selected).
    - **Strategy C (Alternate):** Finds MOCs tagged "Alternate".
    - **Strategy D (Semantic):** If user types "Forklift", searches MOCs for that specific keyword.
3.  **Buildability Check (Client-Side):**
    - Downloads inventory for top ~20 candidates.
    - Compares Candidate Parts vs. Master Bin.
    - Calculates Match % (Exact + Smart Color Swaps).

### 3. Inventory Logic (`src/lib/inventory.ts`)
- **`aggregateInventory`**: Merges multiple set inventories into one map.
- **`checkBuildability`**:
    - **Exact Match:** Same Part ID + Same Color ID.
    - **Color Swap:** Same Part ID + Different Color (counted separately).
    - Returns: `% Match`, `Missing Parts List`, `Color Swap List`.

### 4. The "Brain" (`src/lib/brain.ts`) - *In Progress*
- **Purpose:** Semantic mapping and set analysis.
- **`mapQueryToTags(query)`**: Converts "Race Car" -> `['vehicle', 'car', 'technic']`.
- **`analyzeSet(set, inventory)`**: (Planned) Analyzes a set to determine its "DNA" (e.g., "This is 40% Technic").

### 5. UI Components
- **`SetList`**: Interactive grid of owned sets with selection toggles.
- **`ImportZone`**: Drag-and-drop CSV importer (Brickset/BrickLink support).
- **`ResultsPage`**:
    - **SuggestionBar**: "I want to build..." input.
    - **SmartMocCard**: Displays MOC with Match % Badge and "Missing Parts" accordion.
    - **Filters**: Min Match %, Sort by Parts/Match.

## Data Flow Diagram
1.  **User Input** -> Adds Set / Imports CSV.
2.  **System** -> Fetches Set Details & Inventory -> Caches in Store.
3.  **User Action** -> Selects Sets -> Clicks "Generate Ideas" (or types query).
4.  **Engine** -> Aggregates Master Bin -> Searches Rebrickable for Candidates -> Downloads Candidate Inventories -> Compares Parts.
5.  **Output** -> List of MOCs with "95% Match" badges.

## Future Roadmap (The "Killer Features")
1.  **Knowledge Base Brain:** Persistent database of set patterns and subassemblies.
2.  **3D Instruction Viewer:** WebGL-based LDraw viewer for interactive steps.
3.  **Subassembly Analyzer:** detecting common mechanisms (e.g., "This chassis is used in 5 models").
