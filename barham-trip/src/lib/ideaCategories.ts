import {
  Landmark,
  Mountain,
  FerrisWheel,
  Blocks,
  Palette,
  Trophy,
  Ticket,
  UtensilsCrossed,
  ShoppingBag,
  Lightbulb,
} from 'lucide-react'
import type { IdeaCategory } from './itinerary'

/** Ordered category metadata shared by the ideas board and the day-plan picker,
 *  so grouping, labels and icons stay consistent. */
export const CATEGORY_META: { key: IdeaCategory; label: string; Icon: typeof Landmark }[] = [
  { key: 'sights', label: 'Sights & landmarks', Icon: Landmark },
  { key: 'outdoors', label: 'Outdoors & nature', Icon: Mountain },
  { key: 'rides', label: 'Theme parks & rides', Icon: FerrisWheel },
  { key: 'playgrounds', label: 'Playgrounds & little ones', Icon: Blocks },
  { key: 'cultural', label: 'Museums & culture', Icon: Palette },
  { key: 'sports', label: 'Sports & games', Icon: Trophy },
  { key: 'shows', label: 'Shows & nightlife', Icon: Ticket },
  { key: 'food', label: 'Food & treats', Icon: UtensilsCrossed },
  { key: 'shopping', label: 'Shopping', Icon: ShoppingBag },
  { key: 'other', label: 'More ideas', Icon: Lightbulb },
]

/** Categories offered when someone adds their own idea (excludes the catch-all). */
export const PICKABLE_CATEGORIES = CATEGORY_META.filter((c) => c.key !== 'other')
