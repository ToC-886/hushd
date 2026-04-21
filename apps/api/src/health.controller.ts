import { Controller, Get } from "@nestjs/common";
import { Public } from "./auth/public.decorator";

@Controller("health")
@Public()
export class HealthController {
  @Get()
  get() {
    return { ok: true, service: "hushd-api" };
  }
}
