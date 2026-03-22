/**
 * Gym Service — Thin Wrapper Around Supabase Gym Queries
 *
 * This service builds PostgREST query chains for fetching and managing gyms.
 * Gyms are the organizational unit in Beta Breaker — every route belongs to
 * a gym, and users can favorite multiple gyms to customize their experience.
 *
 * Methods:
 *   getGyms()                          — list all gyms (directory / picker)
 *   getGymById(id)                     — fetch a single gym (detail screen)
 *   getFavoriteGyms(userId)            — list the user's favorited gyms
 *   addFavoriteGym(userId, gymId)      — add a gym to favorites
 *   removeFavoriteGym(userId, gymId)   — remove a gym from favorites
 *
 * Same thin-wrapper pattern as routeService — no business logic, no
 * validation, no state management. RLS handles authorization.
 */

import { supabase } from "@/lib/supabase";

export const gymService = {
  /**
   * Fetch all gyms, alphabetically sorted.
   *
   * Used by the gym directory and the favorites picker. Returns every gym
   * in the system — RLS allows all authenticated users to read gyms.
   * Alphabetical sort makes the list scannable for users.
   *
   * Chain: from('gyms') → select('*') → order('name', ascending)
   */
  getGyms() {
    return supabase
      .from("gyms")
      .select("*")
      .order("name", { ascending: true });
  },

  /**
   * Fetch a single gym by its UUID.
   *
   * Used by the gym detail screen to show address, social links, grade
   * system, and other info. `.single()` enforces exactly-one-row — if
   * the ID doesn't exist, Supabase returns an error (PGRST116).
   *
   * Chain: from('gyms') → select('*') → eq('id', gymId) → single()
   */
  getGymById(gymId: string) {
    return supabase
      .from("gyms")
      .select("*")
      .eq("id", gymId)
      .single();
  },

  /**
   * Fetch all gyms the user has favorited.
   *
   * Queries the favorite_gyms join table and joins the full gym data via
   * the FK relationship. Returns an array of { gym_id, created_at, gyms: {...} }
   * rows — the hook layer extracts the nested gym objects.
   *
   * RLS ensures users can only read their own favorites (user_id = auth.uid()).
   *
   * Chain: from('favorite_gyms') → select('gym_id, gyms(*)') → eq('user_id', userId)
   */
  getFavoriteGyms(userId: string) {
    return supabase
      .from("favorite_gyms")
      .select("gym_id, gyms(*)")
      .eq("user_id", userId);
  },

  /**
   * Add a gym to the user's favorites.
   *
   * Inserts a row into favorite_gyms. The composite PK (user_id, gym_id)
   * prevents duplicates — Supabase returns a conflict error if the gym
   * is already favorited. RLS ensures users can only insert their own rows.
   *
   * @param userId — the auth user's UUID
   * @param gymId — the gym UUID to favorite
   */
  addFavoriteGym(userId: string, gymId: string) {
    return supabase
      .from("favorite_gyms")
      .insert({ user_id: userId, gym_id: gymId });
  },

  /**
   * Remove a gym from the user's favorites.
   *
   * Deletes the row matching (user_id, gym_id) from favorite_gyms.
   * If the row doesn't exist, Supabase returns success with count=0
   * (DELETE is idempotent). RLS ensures users can only delete their own rows.
   *
   * @param userId — the auth user's UUID
   * @param gymId — the gym UUID to unfavorite
   */
  removeFavoriteGym(userId: string, gymId: string) {
    return supabase
      .from("favorite_gyms")
      .delete()
      .eq("user_id", userId)
      .eq("gym_id", gymId);
  },
};
