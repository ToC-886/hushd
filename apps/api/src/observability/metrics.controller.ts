import { Controller, Get, Header } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { Public } from "../auth/public.decorator";
import { MetricsService } from "./metrics.service";

@Controller("metrics")
@Public()
@SkipThrottle()
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header("content-type", "text/plain; version=0.0.4")
  scrape(): string {
    return this.metrics.render();
  }
}
