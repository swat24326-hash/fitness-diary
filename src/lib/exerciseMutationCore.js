/** Insert/update не ждут сеть — иначе админка виснет на HTTP 0 до 28 с. Удаление — да. */
export function shouldAwaitExerciseCloudAck(operation) {
  return operation === 'delete'
}
