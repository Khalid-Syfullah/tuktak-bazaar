import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { AuthUser, CurrentUser, Public } from '../common/auth';
import { CampaignsService } from './campaigns.service';

/** Storefront campaign endpoints. Messages are Bangla because shoppers read them. */
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  /**
   * The campaign to show right now, or null. `serverNow` lets the browser correct its clock for the countdown;
   * `refreshAt` is when the answer next changes, so an open page knows when to ask again.
   */
  @Public()
  @Get('current')
  async current() {
    const now = new Date();
    return { serverNow: now, ...(await this.campaigns.current(now)) };
  }

  @Get(':id/me')
  me(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.campaigns.me(id, user.id);
  }

  @HttpCode(200)
  @Post(':id/play')
  play(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.campaigns.play(id, user.id);
  }
}
