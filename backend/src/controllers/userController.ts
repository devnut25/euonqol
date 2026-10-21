import { Resource } from "../resources/baseResource.js";
import { UserDetailResource, UserResource } from "../resources/users.js";
import { UserService } from "../services/UserService.js";
import { ServiceError } from "../helpers/ServiceError.js";
import { CreateUserInput, UpdateUserInput } from "../validators/schemas/user.js";
import { NextFunction, Request, Response } from "express";

/**
 * GET /euonqol-api/admin/users
 */
export const getUsers = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const authUser = req.user!;
    const { resource = "minimal" } = req.query as any;

    const { users, total, take, skip } = await UserService.getList(
      req.query as Record<string, any>
    );

    const data = UserResource.resolveCollection(resource, users, {
      policy: { authUser },
    });

    return res.json(
      Resource.paginate(data, total, take, skip, "Users retrieved successfully")
    );
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /euonqol-api/admin/users/:id
 */
export const getUserById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const authUser = req.user!;
    const { resource = "detail" } = req.query as any;
    const userId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!userId) {
      return res.status(400).json({ success: false, message: "User ID required" });
    }

    const user = await UserService.getById(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const data = UserResource.resolveItem(resource, user, { policy: { authUser } });

    return res.json(Resource.respond(data, "User retrieved successfully"));
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /euonqol-api/admin/users
 */
export const createUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const formData: CreateUserInput = req.body;
    const user = await UserService.create(formData);

    return res.status(201).json(
      Resource.respond(
        user ? UserDetailResource.make(user) : null,
        "User created successfully"
      )
    );
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    return next(err);
  }
};

/**
 * PATCH /euonqol-api/admin/users/:id
 */
export const updateUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const userId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!userId) {
      return res.status(400).json({ success: false, message: "ID user required" });
    }

    const updateData: UpdateUserInput = req.body;
    const user = await UserService.update(userId, updateData);

    return res.json(
      Resource.respond(
        user ? UserDetailResource.make(user) : { id: userId },
        "User updated successfully"
      )
    );
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    return next(err);
  }
};
