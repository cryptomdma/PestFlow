import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import type { Express, RequestHandler } from "express";
import { pool } from "./db";
import { userStorage, createOrgScopedStorage, type IStorage } from "./storage";
import { verifyPassword } from "./password";
import type { User } from "@shared/schema";

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface User extends Omit<import("@shared/schema").User, "passwordHash"> {}
    interface Request {
      storage: IStorage;
    }
  }
}

function sanitizeUser(user: User): Express.User {
  const { passwordHash, ...rest } = user;
  return rest;
}

passport.use(
  new LocalStrategy({ usernameField: "email", passwordField: "password" }, async (email, password, done) => {
    try {
      const user = await userStorage.getUserByEmail(email.trim().toLowerCase());
      if (!user || user.status !== "active") {
        return done(null, false, { message: "Invalid email or password" });
      }

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        return done(null, false, { message: "Invalid email or password" });
      }

      return done(null, sanitizeUser(user));
    } catch (err) {
      return done(err as Error);
    }
  }),
);

passport.serializeUser((user, done) => {
  done(null, (user as Express.User).id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await userStorage.getUser(id);
    if (!user) {
      return done(null, false);
    }

    done(null, sanitizeUser(user));
  } catch (err) {
    done(err as Error);
  }
});

export function setupAuth(app: Express) {
  const PgSession = connectPgSimple(session);

  app.set("trust proxy", 1);
  app.use(
    session({
      store: new PgSession({ pool, tableName: "session" }),
      secret: process.env.SESSION_SECRET || "dev-secret-change-me",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 24 * 7,
      },
    }),
  );
  app.use(passport.initialize());
  app.use(passport.session());
}

export const requireAuth: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }

  return res.status(401).json({ message: "Authentication required" });
};

// Must run after requireAuth - relies on req.user already being populated.
// Each request gets its own DatabaseStorage instance scoped to the logged-in
// user's org, so every query that instance runs is filtered by that org with
// no per-call chance of passing the wrong id.
export const attachOrgStorage: RequestHandler = (req, res, next) => {
  const orgId = req.user?.orgId;
  if (!orgId) {
    return res.status(403).json({ message: "User is not assigned to an organization" });
  }

  req.storage = createOrgScopedStorage(orgId);
  next();
};

export function registerAuthRoutes(app: Express) {
  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate(
      "local",
      (err: Error | null, user: Express.User | false, info: { message?: string } | undefined) => {
        if (err) return next(err);
        if (!user) {
          return res.status(401).json({ message: info?.message || "Invalid email or password" });
        }

        req.logIn(user, (loginErr) => {
          if (loginErr) return next(loginErr);
          return res.json(user);
        });
      },
    )(req, res, next);
  });

  app.post("/api/auth/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      req.session.destroy(() => {
        res.clearCookie("connect.sid");
        res.status(204).end();
      });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    res.json(req.user);
  });
}
