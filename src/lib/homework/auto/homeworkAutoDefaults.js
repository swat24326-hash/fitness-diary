/**
 * Стартовые настройки авто-ДЗ из карты здоровья: цель — выбранная в карте, иначе из опросника питания; пол — из карточки.
 * Тренер может поменять всё на экране; здесь только подстановка.
 */
import { getHealthSex } from '../../healthCardCore.js'
import { homeworkGoalFromHealthGoal } from '../../health/healthGoalCore.js'
import { nutritionSurveyFromStorage } from '../../nutrition/nutritionSurveyCore.js'

const GOAL_FROM_NUTRITION = {
  lose_weight: 'fat_loss',
  gain_mass: 'tone',
  maintain: 'general',
  endurance: 'endurance',
}

/** @param {object | null | undefined} health */
export function homeworkAutoDefaultsFromHealth(health) {
  const survey = nutritionSurveyFromStorage(health?.nutrition_survey)
  return {
    goal: homeworkGoalFromHealthGoal(health?.goal) ?? GOAL_FROM_NUTRITION[survey?.goalKind] ?? 'general',
    sex: getHealthSex(health),
  }
}
