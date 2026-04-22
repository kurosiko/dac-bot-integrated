export enum ErrorReason {
  InvalidParm,
  QueryFailed,
  InternalError,
}

type ErrorResponse = {
  message: string;
};

export const generateErrorResponse: (
  reason: ErrorReason
) => ErrorResponse = (
  reason: ErrorReason
) => {
  switch (reason) {
    case ErrorReason.InvalidParm:
      return {
        message: "Invalid Parameters"
      };
    case ErrorReason.QueryFailed:
      return {
        message: "Query Failed"
      };
    case ErrorReason.InternalError:
      return {
        message: "Internal Server Error"
      };
  }
};