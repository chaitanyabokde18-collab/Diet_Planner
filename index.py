# # Print the multiplication table of a number.


# def multiplication_table(number , limit):
#     for i in range(1,limit +1):
#         print(f"{number} X {i} = {number * i}")

# multiplication_table(5,10)

# def avg(a,b,c):
    
#     sum = a+b+c
#     mul = sum/3
#     print(mul)
   


    
# avg(3,4,5)
# tv= "chaitanya bokde dfnlsnjsl"
# print(tv[0:7])
# print(tv.endswith("jsl"))
# print(tv.capitalize())
# print(tv.replace("dfnlsnjsl","prushottam"))
# print(tv.find("ait"))
# print()



# # LADDER AND SNAKE 
# 10*10
# import random

# # snake  =random.choice [5,46,12,56,89,99,34]
# # print(snake)

# dice = random[1,2,3,4,5,6]
# a = dice
# you =input("enter your num :")
# # Count how many even and odd digits are present in a number.
# def count_even_odd_digits(n):
#     even_count = 0
#     odd_count = 0

#     n = abs(n)

#     if n == 0:
#         return 1,0

#     while n > 0 :
#         digit = n % 10
        
#         if digit % 2 == 0 :
#             even_count += 1

#         else :
#             odd_count +=1
        
#         n //= 10
#     return even_count,odd_count

# number = int(input("enter your num :"))
# even , odds = count_even_odd_digits(number)
# print(f"even digits : {even}, odd digits : {odds}")

# n = int(input("enter your number :"))
# if (n % 1 ==0 and n % n ==0 ):
#     print("it is a prime number")

# else :
#     print("it is not a prime number")


# s = 350 / 24
# print(s)

# n = -34
# n = abs(n)
# print(n)

# n = int(input("enter your num :"))
# def count_even_odd_digits(n):
#     even_count = 0
#     odd_count = 0
#     while n > 0 :
#         digit = n % 10
        
#     if digit % 2 == 0 :
#         even_count += 1
#     else :
#         odd_count = odd_count +1
# count_even_odd_digits(2456)


# def count_even_odd_digits(n):
#     even_count = 0
#     odd_count = 0

#     n = abs(n)

#     if n == 0:
#         return 1,0

#     while n > 0 :
#         digit = n % 10

#         if digit %2 == 0:
#             even_count +=1
        
#         else :
#             odd_count +=1
#         n//=10
#     return even_count,odd_count

# number = int(input("enter your num :"))
# even,odds = count_even_odd_digits(number)
# print(f"even count : {even}, odd count : {odds}")


# def c_to_f():
#     c = int(input("enter your converting value :"))
#     fahrenheit = (9/5 * c)+32
#     print(f"The conversion of {c}°C to fahrenheit is {fahrenheit}F ")

# c_to_f()

# a = 2
# b = 5

# swap = a
# a = b
# b = swap
# print(a)
# print("after swapping")
# print("a = ",a)
# print("b =", b)

# def avg():
#     a =int(input("enter your num a :"))
#     b =int(input("enter your num b :"))
#     c = int(input("enter your num c :"))

#     sum = a + b + c
#     avg = sum/3
#     print(avg)

# avg()

# # 1 hr = 60 

# def converter(n):
#     converter = n * 60
#     print(f"The {n}Hr is converting in {converter} min")
    
# converter(3)

# minutes = int(input("enter your num :"))

# hours = minutes // 60 
# remaining_minutes = minutes % 60

# print(f"The hours : {hours}hr")
# print(f"remaining minutes : {remaining_minutes}min")

# hour = n // 3600
# n = int(input("enter your seconds :"))
# remaining_second = n % 3600

# minutes = remaining_second // 60
# second = remaining_second % 60
# print(hour)
# print(remaining_second)
# print(f"The hours : {hour}hr")
# print(f"remaining minutes : {minutes}min")
# print(f"The remaining second : {second}sec")



# l = []
# n = int(input("how many number are you enter ? : "))
# i = 0
# for i in range(i,n):
#     print(int(input("your number :")))
#     l.append(i)
# print(l)   

# for i in l:
#     if( i== 0):
#         print(f"{i} is a zero.")

#     elif(i == abs(i)):
#         print(f"{i} is a positive number.")
#     else:
#         print(f"{i} is a negative number.")
# M = int(input("enter your Maths score :"))
# P = int(input("enter your Physics score :"))
# C = int(input("enter your Chemistry score :"))
# B = int(input("enter your Biology score :"))

# if ((M < 35) or (P < 35) or (C < 35) or (B < 35)) :
#     print("you are fail......work on yourself. ")

# elif ((M == 35) and (P == 35) and (C == 35) and (B == 35)):
#     print("you are just just a boundry pass.....you can do better  otherwise  you will fail . ")

# else:
#     print("Great you are pass.")


# for i in range(1,100):
#     if (i % 2 == 0):
#         print(f"{i} is a even number.")

# n = int(input("enter your num :"))
# for i in range(1,n):
#     print(i)
 
# # Count the number of digits in a number.
# n = int(input("enter your number :"))
# count = 0

# n=abs(n)

# if n == 0 :
#     count = 1
# else:
#     while n > 0 :
#         n = n // 10
#         count +=1
# print("the digit in the number :",count)

# person = int(input("enter your age :"))
# if(person < 18):
#     print(f"You are {person} years old  not eligible for vote . ")

# elif (person == 18):
#     print("So, you are 18 wait 1 year then you can perfect for voting .")

# else:
#     print(f"You are {person} years old now you are eligible to vote.")

# num = int(input("enter your number :"))
# if ((num % 5 == 0)  and (num % 11 == 0) ):
#     print(f"{num} This is the number which divided by both. ")

# else :
#     print(f"{num} This is not the number which divided by both. ")

# l  = []
# i = 0
# for i in range(1,100):
#     if(i%2 != 0):
#         print(i)
#         l.append(i)
#         i +=1
# print(f"l = {l}")

# n = int(input("put your number :"))
# i = 1
# f = 1
# # for i in range(n):
# while i <=n :
#         f = f*i
#         i +=1
# print(f)    
        
# x = int(input("put your number :"))
# for i in range(1,11):
#     print(f"{x} X {i} = {x*i}")    
        
a = input("enter the palindrome :")
count =0
if (a[0] == a[-1]):
    print(f"This is the palindrome : {a}")
a //= 10
count +=1
print(count)

else:
    print("This is not a palindrome ")

# d = "chaitanya"
# print(d[-1],d[0])