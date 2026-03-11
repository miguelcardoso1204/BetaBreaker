/**
 * Gym Service — Thin Wrapper Around Supabase Gym Queries
 *
 * This service builds PostgREST query chains for fetching and managing gyms.
 * Gyms are the organizational unit in Beta Breaker — every route belongs to
 * a gym, and users set a "home gym" to customize their experience.
 *
 * Methods:
 *   getGyms()              — list all gyms (for directory / picker screens)
 *   getGymById(id)         — fetch a single gym (for gym detail screen)
 *   setHomeGym(userId, id) — set the user's home gym (updates profile)
 *
 * Same thin-wrapper pattern as routeService — no business logic, no
 * validation, no state management. RLS handles authorization.
 */

import { supabase } from "@/lib/supabase";

export const gymService = {
  /**
   * Fetch all gyms, alphabetically sorted.
   *
   * Used by the gym directory and the home gym picker. Returns every gym
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
   * Set the user's home gym by updating their profile.
   *
   * This writes to the `profiles` table (not `gyms`) because `home_gym_id`
   * is a column on profiles — it's the user's preference, not a gym property.
   * RLS ensures users can only update their own profile (id = auth.uid()).
   *
   * The hook layer passes `session.user.id` as userId, so the RLS check
   * always passes for the current user.
   *
   * Chain: from('profiles') → update({ home_gym_id }) → eq('id', userId)
   *
   * @param userId — the auth user's UUID (from session)
   * @param gymId — the gym UUID to set as home gym
   */
  setHomeGym(userId: string, gymId: string | null) {
    return supabase
      .from("profiles")
      .update({ home_gym_id: gymId })
      .eq("id", userId);
  },
};
