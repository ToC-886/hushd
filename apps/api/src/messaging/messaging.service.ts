import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { RequestUser } from "../auth/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";
import type { SendMessageDto } from "./dto/send-message.dto";
import type { TipDto } from "./dto/tip.dto";

@Injectable()
export class MessagingService {
  constructor(private readonly prisma: PrismaService) {}

  async sendMessage(user: RequestUser, dto: SendMessageDto) {
    const subscription = await this.prisma.subscription.findUnique({
      where: {
        fanUserId_creatorId: {
          fanUserId: user.id,
          creatorId: dto.creatorId,
        },
      },
    });
    if (!subscription || subscription.status !== "ACTIVE") {
      throw new ForbiddenException("active_subscription_required");
    }
    const conversation = await this.prisma.conversation.upsert({
      where: {
        fanUserId_creatorId: {
          fanUserId: user.id,
          creatorId: dto.creatorId,
        },
      },
      create: {
        fanUserId: user.id,
        creatorId: dto.creatorId,
      },
      update: {},
    });

    const message = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderUserId: user.id,
        body: dto.body,
      },
    });

    if (dto.ppvPriceCents) {
      await this.prisma.ppvMessage.create({
        data: {
          messageId: message.id,
          priceCents: dto.ppvPriceCents,
          currency: dto.currency ?? "EUR",
        },
      });
    }
    return message;
  }

  async unlockPpv(user: RequestUser, messageId: string) {
    const ppv = await this.prisma.ppvMessage.findUnique({ where: { messageId } });
    if (!ppv) throw new NotFoundException("ppv_message_not_found");

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: true },
    });
    if (!message || message.conversation.fanUserId !== user.id) {
      throw new ForbiddenException("not_allowed");
    }
    if (ppv.unlockTxnId) {
      return { ok: true as const, alreadyUnlocked: true };
    }

    const tx = await this.prisma.transaction.create({
      data: {
        payerUserId: user.id,
        payeeCreatorId: message.conversation.creatorId,
        type: "PPV_PURCHASE",
        status: "SUCCEEDED",
        grossCents: ppv.priceCents,
        feeCents: Math.floor(ppv.priceCents * 0.15),
        netCents: ppv.priceCents - Math.floor(ppv.priceCents * 0.15),
        currency: ppv.currency,
        processor: "internal",
        processorTxnId: `ppv_${messageId}_${Date.now()}`,
      },
    });
    await this.prisma.ppvMessage.update({
      where: { messageId },
      data: { unlockTxnId: tx.id },
    });
    return { ok: true as const, transactionId: tx.id };
  }

  async sendTip(user: RequestUser, dto: TipDto) {
    const transaction = await this.prisma.transaction.create({
      data: {
        payerUserId: user.id,
        payeeCreatorId: dto.creatorId,
        type: "TIP",
        status: "SUCCEEDED",
        grossCents: dto.amountCents,
        feeCents: Math.floor(dto.amountCents * 0.15),
        netCents: dto.amountCents - Math.floor(dto.amountCents * 0.15),
        currency: dto.currency ?? "EUR",
        processor: "internal",
        processorTxnId: `tip_${user.id}_${Date.now()}`,
      },
    });
    return this.prisma.tip.create({
      data: {
        fromUserId: user.id,
        toCreatorId: dto.creatorId,
        postId: dto.postId,
        messageId: dto.messageId,
        amountCents: dto.amountCents,
        currency: dto.currency ?? "EUR",
        transactionId: transaction.id,
      },
    });
  }

  async conversation(user: RequestUser, creatorId: string) {
    const convo = await this.prisma.conversation.findUnique({
      where: {
        fanUserId_creatorId: {
          fanUserId: user.id,
          creatorId,
        },
      },
      include: {
        messages: {
          include: { ppv: true },
          orderBy: { createdAt: "asc" },
          take: 200,
        },
      },
    });
    if (!convo) return { messages: [] };
    return convo;
  }
}
