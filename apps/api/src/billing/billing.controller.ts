import { Body, Controller, Get, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CurrentUser, type RequestUser } from "../auth/current-user.decorator";
import { VerificationPolicyGuard } from "../verification/verification-policy.guard";
import { RequireVerification } from "../verification/verification.decorator";
import { BillingService } from "./billing.service";
import { CancelSubscriptionDto } from "./dto/cancel-subscription.dto";
import { CreateSubscriptionDto } from "./dto/create-subscription.dto";

@Controller("billing")
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Post("subscriptions/checkout")
  @HttpCode(200)
  @UseGuards(VerificationPolicyGuard)
  @RequireVerification("age")
  createCheckout(@CurrentUser() user: RequestUser, @Body() dto: CreateSubscriptionDto) {
    return this.billing.createSubscriptionCheckout(user, dto);
  }

  @Post("subscriptions/cancel")
  @HttpCode(200)
  @UseGuards(VerificationPolicyGuard)
  @RequireVerification("age")
  cancelSubscription(@CurrentUser() user: RequestUser, @Body() dto: CancelSubscriptionDto) {
    return this.billing.cancelSubscription(user, dto);
  }

  @Get("history")
  @UseGuards(VerificationPolicyGuard)
  @RequireVerification("age")
  paymentHistory(@CurrentUser() user: RequestUser) {
    return this.billing.paymentHistory(user);
  }

  @Get("subscriptions")
  @UseGuards(VerificationPolicyGuard)
  @RequireVerification("age")
  mySubscriptions(@CurrentUser() user: RequestUser) {
    return this.billing.mySubscriptions(user);
  }
}
