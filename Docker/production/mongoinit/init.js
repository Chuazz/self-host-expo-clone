/* eslint-disable no-undef */
try {
  // let db = connect(
  //   "mongodb://admin:myPRODUCTIONPassword@localhost:27017/admin"
  // );

  // db = db.getSiblingDB("expo");

  db.createUser({
    user: "expo",
    pwd: "myRegularUserPassw",
    roles: [
      {
        role: "readWrite",
        db: "expo",
      },
    ],
  });
} catch (error) {
  console.log("🚀 ~ error:", error);
}
