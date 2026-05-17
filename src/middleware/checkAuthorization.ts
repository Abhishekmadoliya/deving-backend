import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { configDotenv } from "dotenv"
import User from "../models/user.model.js";

configDotenv()


export const checkAuthorization = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const token = req.cookies.token;

        if (!token) {
            return res.status(401).json({
                status: 401,
                message: "Unauthorized"
            })
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET!);


        if (!decoded) {
            return res.status(401).json({
                status: 401,
                message: "Unauthorized"
            })
        }

        // get user from decoded.email 
        const user = await User.findOne({ email: decoded.email });

        if (!user) {
            return res.status(401).json({
                status: 401,
                message: "Unauthorized"
            })
        }

        req.user = user;
        next();


    } catch (error) {
        console.log(error);
        return res.status(500).json({
            status: 500,
            message: "Internal server error",
            error: error
        })
    }
}