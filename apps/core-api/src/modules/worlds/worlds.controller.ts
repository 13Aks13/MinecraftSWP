import type { Paginated, WorldDto } from "@mc/shared";
import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CreateWorldDto, ListWorldsQueryDto, UpdateWorldPacksDto } from "./dto/world.dto.js";
import { WorldsService } from "./worlds.service.js";

@ApiTags("worlds")
@ApiBearerAuth()
@Controller("worlds")
export class WorldsController {
  constructor(@Inject(WorldsService) private readonly worlds: WorldsService) {}

  @Get()
  @ApiOperation({ summary: "List worlds in the library" })
  list(@Query() query: ListWorldsQueryDto): Promise<Paginated<WorldDto>> {
    return this.worlds.list(query);
  }

  @Get(":id")
  get(@Param("id", ParseUUIDPipe) id: string): Promise<WorldDto> {
    return this.worlds.get(id).then((world) => this.worlds.toDto(world));
  }

  @Post()
  @Roles("admin", "moderator")
  @ApiOperation({ summary: "Create a world and generate pack configuration files" })
  create(@Body() dto: CreateWorldDto): Promise<WorldDto> {
    return this.worlds.create(dto);
  }

  @Put(":id/packs")
  @Roles("admin", "moderator")
  @ApiOperation({ summary: "Update a world's packs and generate Bedrock pack configuration files" })
  updatePacks(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorldPacksDto,
  ): Promise<WorldDto> {
    return this.worlds.updatePacks(id, dto);
  }

  @Post(":id/activate")
  @Roles("admin", "moderator")
  @ApiOperation({ summary: "Copy the world into the Bedrock data volume and start the server" })
  activate(@Param("id", ParseUUIDPipe) id: string): Promise<WorldDto> {
    return this.worlds.activate(id);
  }

  @Post(":id/clone")
  @Roles("admin", "moderator")
  clone(@Param("id", ParseUUIDPipe) id: string): Promise<WorldDto> {
    return this.worlds.clone(id);
  }

  @Post(":id/refresh-size")
  @Roles("admin", "moderator")
  async refreshSize(@Param("id", ParseUUIDPipe) id: string): Promise<{ sizeBytes: string }> {
    return { sizeBytes: await this.worlds.refreshSize(id) };
  }

  @Delete(":id")
  @Roles("admin", "moderator")
  async remove(@Param("id", ParseUUIDPipe) id: string): Promise<{ deleted: true }> {
    await this.worlds.remove(id);
    return { deleted: true };
  }
}
