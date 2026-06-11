export interface PaymentResponseDto {
  id: string;
  status: "approved" | "declined";
  amount: number;
}
