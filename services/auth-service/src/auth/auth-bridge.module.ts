import { Module } from '@nestjs/common';
import { AuthBridgeController } from './auth-bridge.controller';

@Module({
  controllers: [AuthBridgeController],
})
export class AuthBridgeModule {}
