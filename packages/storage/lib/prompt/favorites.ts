import { StorageEnum } from '../base/enums';
import { createStorage } from '../base/base';
import type { BaseStorage } from '../base/types';

const LEGACY_CONTENT_MARKERS = ['nanobrowser', 'x.com/nanobrowser', 'github.com/nanobrowser'];

const defaultFavoritePrompts = [
  {
    title: '📚 Explore AI Papers',
    content:
      '- Go to https://huggingface.co/papers and click through each of the first 3 papers.\n- For each paper:\n  - Record the title, URL and upvotes\n  - Summarise the abstract section\n- Finally, compile together a summary of all 3 papers, ranked by upvotes',
  },
  {
    title: '🏨 Hotel Group Booking Quote',
    content:
      'Navigate to https://mail.google.com/mail/u/1/#inbox — the user will already be logged in. Search for group booking inquiries using the query: "group booking OR block reservation OR event inquiry OR RFP OR corporate rate OR wedding block OR room block". Open the matching email and COPY the full content Of the email only.\nNext, navigate to the Autumn application at http://localhost:3000/groups and click new quote. Paste the email content into the Quick Import field and generate a quote. Once the quote is generated, scroll down and copy the generated email reply By clicking on the copy to HTML button which will save it to clipboard.\nNavigate back to Gmail at https://mail.google.com/mail/u/1/#inbox. Open the original email thread, click reply, and paste the generated reply into the compose window. Save it as a draft only — do NOT send it.',
  },
  {
    title: '📊 Performance Next Week',
    content: 'How does my performance next week look?',
  },
  {
    title: '💲 Hotel Rate Parity Check',
    content:
      'Go to google.com/travel/hotels and search for the Olea Hotel. Open the hotel\'s detail page and record the nightly rates for the Direct channel and Booking.com from the price comparison panel for the currently displayed check-in date, saving the result as a finding with the key prices_checkin and a value such as "Direct: $189, Booking.com: $205". Next, calculate the variance using (Booking.com price − Direct price) / Direct price × 100 and flag it if the variance falls outside the acceptable range of −2% to +15%, with the target markup being 10%. Save the analysis as a finding with the key parity_analysis, including the variance percentage and whether it is flagged. If flagged, calculate the target Direct rate by dividing the Booking.com price by 1.10 and rounding down to the nearest whole dollar, never setting it below a floor price of $150. Then go to Mews at https://app.mews-demo.com/Commander/742af69f-59a4-453b-8833-ac7500ad9cb8/Dashboard/Index, select the "Stay" service from the dropdown on the left, and navigate to Rate Management. On the Rate Management page, locate the Base price row on the left — it should be the first row with orange cells. You\'ll see a grid of prices with dates as columns. Click the cell corresponding to todays date on the Base price row only — do not modify any other rate, category, or date row. A form will appear with "Absolute adjustment" and "Relative adjustment %" fields. Enter the new rate using the Absolute adjustment field, calculated as the difference between the new target rate and the current base price (after the correct inputs, assume it worked), leave Relative adjustment % unchanged, and save.',
  },
];

// Define the favorite prompt type
export interface FavoritePrompt {
  id: number;
  title: string;
  content: string;
}

// Define the favorites storage type
export interface FavoritesStorage {
  nextId: number;
  prompts: FavoritePrompt[];
}

// Define the interface for favorite prompts storage operations
export interface FavoritePromptsStorage {
  addPrompt: (title: string, content: string) => Promise<FavoritePrompt>;
  updatePrompt: (id: number, title: string, content: string) => Promise<FavoritePrompt | undefined>;
  updatePromptTitle: (id: number, title: string) => Promise<FavoritePrompt | undefined>;
  removePrompt: (id: number) => Promise<void>;
  getAllPrompts: () => Promise<FavoritePrompt[]>;
  getPromptById: (id: number) => Promise<FavoritePrompt | undefined>;
  reorderPrompts: (draggedId: number, targetId: number) => Promise<void>;
}

// Initial state with proper typing
const initialState: FavoritesStorage = {
  nextId: 1,
  prompts: [],
};

// Create the favorites storage
const favoritesStorage: BaseStorage<FavoritesStorage> = createStorage('favorites', initialState, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
});

/**
 * Creates a storage interface for managing favorite prompts
 */
export function createFavoritesStorage(): FavoritePromptsStorage {
  return {
    addPrompt: async (title: string, content: string): Promise<FavoritePrompt> => {
      // Check if prompt with same content already exists
      const { prompts } = await favoritesStorage.get();
      const existingPrompt = prompts.find(prompt => prompt.content === content);

      // If exists, return the existing prompt
      if (existingPrompt) {
        return existingPrompt;
      }

      // Otherwise add new prompt
      await favoritesStorage.set(prev => {
        const id = prev.nextId;
        const newPrompt: FavoritePrompt = { id, title, content };

        return {
          nextId: id + 1,
          prompts: [newPrompt, ...prev.prompts],
        };
      });

      return (await favoritesStorage.get()).prompts[0];
    },

    updatePrompt: async (id: number, title: string, content: string): Promise<FavoritePrompt | undefined> => {
      let updatedPrompt: FavoritePrompt | undefined;

      await favoritesStorage.set(prev => {
        const updatedPrompts = prev.prompts.map(prompt => {
          if (prompt.id === id) {
            updatedPrompt = { ...prompt, title, content };
            return updatedPrompt;
          }
          return prompt;
        });

        // If prompt wasn't found, leave the storage unchanged
        if (!updatedPrompt) {
          return prev;
        }

        return {
          ...prev,
          prompts: updatedPrompts,
        };
      });

      return updatedPrompt;
    },

    updatePromptTitle: async (id: number, title: string): Promise<FavoritePrompt | undefined> => {
      let updatedPrompt: FavoritePrompt | undefined;

      await favoritesStorage.set(prev => {
        const updatedPrompts = prev.prompts.map(prompt => {
          if (prompt.id === id) {
            updatedPrompt = { ...prompt, title };
            return updatedPrompt;
          }
          return prompt;
        });

        // If prompt wasn't found, leave the storage unchanged
        if (!updatedPrompt) {
          return prev;
        }

        return {
          ...prev,
          prompts: updatedPrompts,
        };
      });

      return updatedPrompt;
    },

    removePrompt: async (id: number): Promise<void> => {
      await favoritesStorage.set(prev => ({
        ...prev,
        prompts: prev.prompts.filter(prompt => prompt.id !== id),
      }));
    },

    getAllPrompts: async (): Promise<FavoritePrompt[]> => {
      const currentState = await favoritesStorage.get();
      let prompts = currentState.prompts;

      const hasLegacyPrompts = prompts.some(p =>
        LEGACY_CONTENT_MARKERS.some(marker => p.content.toLowerCase().includes(marker)),
      );
      if (hasLegacyPrompts) {
        prompts = prompts.filter(p => !LEGACY_CONTENT_MARKERS.some(marker => p.content.toLowerCase().includes(marker)));
        await favoritesStorage.set(prev => ({
          ...prev,
          prompts,
        }));
      }

      const missingDefaults = defaultFavoritePrompts.filter(dp => !prompts.some(p => p.content === dp.content));
      if (missingDefaults.length > 0) {
        for (const prompt of missingDefaults) {
          await favoritesStorage.set(prev => {
            const id = prev.nextId;
            const newPrompt: FavoritePrompt = { id, title: prompt.title, content: prompt.content };
            return { nextId: id + 1, prompts: [newPrompt, ...prev.prompts] };
          });
        }
        const newState = await favoritesStorage.get();
        prompts = newState.prompts;
      }
      return [...prompts].sort((a, b) => b.id - a.id);
    },

    getPromptById: async (id: number): Promise<FavoritePrompt | undefined> => {
      const { prompts } = await favoritesStorage.get();
      return prompts.find(prompt => prompt.id === id);
    },

    reorderPrompts: async (draggedId: number, targetId: number): Promise<void> => {
      await favoritesStorage.set(prev => {
        // Create a copy of the current prompts
        const promptsCopy = [...prev.prompts];

        // Find indexes
        const sourceIndex = promptsCopy.findIndex(prompt => prompt.id === draggedId);
        const targetIndex = promptsCopy.findIndex(prompt => prompt.id === targetId);

        // Ensure both indexes are valid
        if (sourceIndex === -1 || targetIndex === -1) {
          return prev; // No changes if either index is invalid
        }

        // Reorder by removing dragged item and inserting at target position
        const [movedItem] = promptsCopy.splice(sourceIndex, 1);
        promptsCopy.splice(targetIndex, 0, movedItem);

        // Assign new IDs based on the order
        const numPrompts = promptsCopy.length;
        const updatedPromptsWithNewIds = promptsCopy.map((prompt, index) => ({
          ...prompt,
          id: numPrompts - index, // Assigns IDs: numPrompts, numPrompts-1, ..., 1
        }));

        return {
          ...prev,
          prompts: updatedPromptsWithNewIds,
          nextId: numPrompts + 1, // Update nextId accordingly
        };
      });
    },
  };
}

// Export an instance of the storage by default
export default createFavoritesStorage();
