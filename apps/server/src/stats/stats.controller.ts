import { Controller, Get, Query, Req } from '@nestjs/common';
import { AdminCheckService } from '../auth/admin-check';
import { StatsService } from './stats.service';

@Controller('stats')
export class StatsController {
  constructor(
    private readonly stats: StatsService,
    private readonly adminCheck: AdminCheckService,
  ) {}

  @Get('overview')
  overview(@Req() req: { headers: Record<string, string | undefined> }) {
    return this.stats.overview(this.adminCheck.isAdmin(req.headers));
  }

  @Get('heatmap')
  heatmap() {
    return this.stats.heatmap();
  }

  @Get('monthly')
  monthly() {
    return this.stats.monthly();
  }

  @Get('top')
  top(@Query('limit') limit?: string, @Req() req: { headers: Record<string, string | undefined> } = { headers: {} }): Promise<unknown> {
    return this.stats.top(Number(limit) || 10, this.adminCheck.isAdmin(req.headers));
  }
}
