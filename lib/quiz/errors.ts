/** An expected failure with an HTTP status (not found, forbidden, rate-limited…). */
export class QuizError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "QuizError";
  }
}
