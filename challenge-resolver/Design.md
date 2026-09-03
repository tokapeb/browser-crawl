### Stack:
Nodejs + Typescript, npm

### Project result
An npm package to use in other projects

### The package
The package is a challenge resolver for games. The package exports a challenge resolver class. It has 3 parameters, the limits for the 3 pools to satisfy. The default values are 10,8,6

### Example of usage
import challengeResolver from "challenge-resolver"

const resolver = challengeResolver.new()

const successes = resolver(4,0,0)

### **Mechanic: Hierarchical Slot-Filling (3-Pool D10 System)**

**Objective:** Calculate successes by filling hierarchical slots with rolled D10s. Dice are assigned to the **hardest possible slot** they can satisfy, moving down to easier slots only if necessary.

#### **1. Inputs & Slot Definition**
Given three pool values: `X` (Largest), `Y` (Medium), `Z` (Smallest).
*   **Constraint:** $X \ge Y \ge Z \ge 0$.
*   **Dice Pool Size:** Roll `X` D10s.

The `X` dice attempt to fill `X` slots, divided into three tiers by difficulty:

| Tier Name | Slot Type | Count Formula | Success Threshold | Difficulty |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 3** | **Peak Slots** | `X - Y` | Roll $==$ **10** | **Hardest** |
| **Tier 2** | **Mid Slots** | `Y - Z` | Roll $\ge$ **8** | **Medium** |
| **Tier 1** | **Base Slots** | `Z` | Roll $\ge$ **6** | **Easiest** |

#### **2. Algorithm**
1.  **Sort Rolls:** Sort the `X` rolled dice in **descending** order (Highest to Lowest).
2.  **Initialize Counters:**
    *   `filled_tier3 = 0`, `target_tier3 = X - Y`
    *   `filled_tier2 = 0`, `target_tier2 = Y - Z`
    *   `filled_tier1 = 0`, `target_tier1 = Z`
3.  **Assign Dice (Greedy Approach - Hardest First):**
    Iterate through the sorted dice one by one:
    
    *   **Step A: Attempt Tier 3 (Peak):**
        If `filled_tier3 < target_tier3` AND `die == 10`:
        *   Increment `filled_tier3`.
        *   Move to next die.
    
    *   **Step B: Else, Attempt Tier 2 (Mid):**
        If `filled_tier2 < target_tier2` AND `die >= 8`:
        *   Increment `filled_tier2`.
        *   Move to next die.
    
    *   **Step C: Else, Attempt Tier 1 (Base):**
        If `filled_tier1 < target_tier1` AND `die >= 6`:
        *   Increment `filled_tier1`.
        *   Move to next die.
    
    *   **Else:** The die fails to fill any slot.

4.  **Result:** `Total Successes = filled_tier3 + filled_tier2 + filled_tier1`

#### **3. Example**

**Inputs:**
*   Pools: `X=6`, `Y=3`, `Z=1`
*   **Slot Breakdown:**
    *   **Tier 3 (Peak):** `6 - 3 = 3` slots (Needs `10`)
    *   **Tier 2 (Mid):** `3 - 1 = 2` slots (Needs $\ge$ 8)
    *   **Tier 1 (Base):** `1` slot (Needs $\ge$ 6)
*   **Rolls:** `[5, 6, 7, 8, 9, 10]`

**Execution:**
1.  **Sort Rolls:** `[10, 9, 8, 7, 6, 5]`
2.  **Iterate:**
    *   **Die 10:** Can it fill **Tier 3**? Yes (Target 3, Current 0).
        *   Action: Fill Tier 3. `filled_tier3` becomes 1.
    *   **Die 9:** Can it fill **Tier 3**? No (needs 10).
        *   Can it fill **Tier 2**? Yes (Target 2, Current 0, needs ≥8).
        *   Action: Fill Tier 2. `filled_tier2` becomes 1.
    *   **Die 8:** Can it fill **Tier 3**? No.
        *   Can it fill **Tier 2**? Yes (Target 2, Current 1, needs ≥8).
        *   Action: Fill Tier 2. `filled_tier2` becomes 2. (Tier 2 now full).
    *   **Die 7:** Can it fill **Tier 3**? No.
        *   Can it fill **Tier 2**? No (Full).
        *   Can it fill **Tier 1**? Yes (Target 1, Current 0, needs ≥6).
        *   Action: Fill Tier 1. `filled_tier1` becomes 1. (Tier 1 now full).
    *   **Die 6:** All tiers full. Fails.
    *   **Die 5:** All tiers full. Fails.

**Final Count:**
*   Tier 3 Filled: 1
*   Tier 2 Filled: 2
*   Tier 1 Filled: 1
*   **Total Successes: 4**
