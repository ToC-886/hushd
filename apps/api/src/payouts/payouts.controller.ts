import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { CurrentUser, type RequestUser } from "../auth/current-user.decorator";
import { VerificationPolicyGuard } from "../verification/verification-policy.guard";
import { RequireVerification } from "../verification/verification.decorator";
import { CreatePayoutAccountDto } from "./dto/create-payout-account.dto";
import { RequestPayoutDto } from "./dto/request-payout.dto";
import { PayoutsService } from "./payouts.service";

@Controller("payouts")
@UseGuards(VerificationPolicyGuard)
@RequireVerification("creator")
export class PayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Post("accounts")
  createAccount(@CurrentUser() user: RequestUser, @Body() dto: CreatePayoutAccountDto) {
    return this.payouts.createAccount(user, dto);
  }

  @Get("accounts")
  listAccounts(@CurrentUser() user: RequestUser) {
    return this.payouts.listAccounts(user);
  }

  @Get("balance")
  balance(@CurrentUser() user: RequestUser) {
    return this.payouts.availableBalance(user);
  }

  @Post("request")
  request(@CurrentUser() user: RequestUser, @Body() dto: RequestPayoutDto) {
    return this.payouts.requestPayout(user, dto);
  }

  @Get("me")
  mine(@CurrentUser() user: RequestUser) {
    return this.payouts.myPayouts(user);
  }
}
