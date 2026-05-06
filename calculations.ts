export type Sex = "male" | "female";

export type ActivityLevel = "low" | "light" | "medium" | "high";

export const activityMultipliers: Record<ActivityLevel, number> = {
  low: 1.2,
  light: 1.375,
  medium: 1.55,
  high: 1.725
};

export const activityDescriptions: Record<ActivityLevel, string> = {
  low: "Сидячий спосіб життя, мінімум руху.",
  light: "Легкі тренування або прогулянки 1-3 рази на тиждень.",
  medium: "Помірна активність, тренування 3-5 разів на тиждень.",
  high: "Інтенсивні тренування або фізична робота 6-7 разів на тиждень."
};

/**
 * Calculates Basal Metabolic Rate (BMR) using Mifflin-St Jeor formula.
 * Men: BMR = 10 * weight + 6.25 * height - 5 * age + 5
 * Women: BMR = 10 * weight + 6.25 * height - 5 * age - 161
 */
export function calculateBMR(
  weight: number,
  height: number,
  age: number,
  sex: Sex
): number {
  const base = 10 * weight + 6.25 * height - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}

/**
 * Calculates Total Daily Energy Expenditure (TDEE).
 * TDEE = BMR * activity_multiplier
 */
export function calculateTDEE(bmr: number, activity: ActivityLevel): number {
  const multiplier = activityMultipliers[activity];
  return bmr * multiplier;
}

export type Goal = "lose" | "maintain" | "gain";

/**
 * Calculates recommended calories based on TDEE and Goal.
 * lose → -400 kcal
 * maintain → 0 kcal
 * gain → +300 kcal
 */
export function calculateRecommendedCalories(tdee: number, goal: Goal): number {
  const adjustments: Record<Goal, number> = {
    lose: -400,
    maintain: 0,
    gain: 300
  };
  return tdee + adjustments[goal];
}
